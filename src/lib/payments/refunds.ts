import 'server-only'
import type { Prisma, RefundStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import { paiseToDecimalString, rupeesToPaise } from '@/lib/money'
import { publishEvent } from '@/lib/realtime/publish'
import type { Actor } from '@/lib/auth/guards'
import { recordStatusChange } from '@/lib/orders/events'
import { gatewayErrorText, getGatewayFor, isInsufficientBalance, type GatewayRefund } from './gateway'

// ===========================================================================
// Refund lifecycle (customer-facing names in brackets)
//   NOT_REQUESTED → REQUESTED [Refund requested] → PROCESSING [Refund processing]
//   → PROCESSED [Refund processed: Razorpay confirmed via refund.processed or a
//   server-side lookup — the bank may still be crediting it]
//   → CREDITED [Refunded: bank credit confirmed by authorised staff with evidence].
//   FAILED [Refund failed] can be retried; REVERSED [Refund reversed].
// Razorpay offers no API that confirms the customer's bank credit, so nothing
// here ever sets CREDITED automatically — not on a webhook, not after N days.
// ===========================================================================

export type RefundOutcome = 'processed' | 'pending_gateway' | 'already_processed' | 'in_progress' | 'failed'
type Source = 'api' | 'webhook' | 'status_check'

const LOW_BALANCE_MESSAGE =
  'Razorpay balance is too low for this refund. Add funds in the Razorpay Dashboard (Balances), then retry.'

/** Money already committed to refunds on a payment (excluding one refund). */
async function committedRefundPaise(tx: Prisma.TransactionClient, paymentId: string, excludeRefundId: string) {
  const rows = await tx.refund.findMany({
    where: { paymentId, id: { not: excludeRefundId }, status: { in: ['REQUESTED', 'PROCESSING', 'PROCESSED', 'CREDITED'] } },
    select: { amount: true },
  })
  return rows.reduce((s, r) => s + rupeesToPaise(r.amount), 0)
}

/**
 * Sends a refund to the gateway. The atomic claim (NOT_REQUESTED/FAILED →
 * REQUESTED) guarantees one caller per refund; before creating anything we ask
 * the gateway whether a refund for this Refund.id already exists (a timed-out
 * earlier attempt), so a retry can never pay the customer twice.
 * actor = null means the system (automatic refunds).
 */
export async function processRefund(refundId: string, actor: Actor | null): Promise<RefundOutcome> {
  const claim = await db.refund.updateMany({
    where: { id: refundId, status: { in: ['NOT_REQUESTED', 'FAILED'] } },
    data: { status: 'REQUESTED', failureReason: null, requestedAt: new Date() },
  })
  if (!claim.count) {
    const r = await db.refund.findUnique({ where: { id: refundId } })
    if (!r) throw new AppError('NOT_FOUND', 'Refund not found.')
    if (r.status === 'PROCESSED' || r.status === 'CREDITED') return 'already_processed'
    if (r.status === 'REVERSED') throw new AppError('CONFLICT', 'This refund was reversed by the bank. Check it in the Razorpay Dashboard before doing anything else.')
    return 'in_progress' // REQUESTED/PROCESSING: already with Razorpay — never send a second refund
  }

  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true, order: true } })
  const fail = async (reason: string) => {
    await db.refund.update({ where: { id: refund.id }, data: { status: 'FAILED', failureReason: reason.slice(0, 300) } })
    await audit({ actor, action: 'refund.failed', entityType: 'Refund', entityId: refund.id, metadata: { error: reason.slice(0, 300) } })
  }

  // Eligibility: a captured payment, never more than what was captured
  if (!refund.payment.gatewayPaymentId || !['SUCCEEDED', 'REFUNDED'].includes(refund.payment.status)) {
    await fail('No captured payment to refund')
    throw new AppError('PAYMENT', 'There is no captured payment to refund for this order.')
  }
  const already = await committedRefundPaise(db, refund.paymentId, refund.id)
  const amountPaise = rupeesToPaise(refund.amount)
  if (amountPaise <= 0 || amountPaise + already > rupeesToPaise(refund.payment.amount)) {
    await fail('Refund amount is more than the captured payment')
    throw new AppError('VALIDATION', 'The refund is more than the amount that was paid.')
  }

  const gateway = getGatewayFor(refund.payment.provider)
  let result: GatewayRefund
  try {
    // A refund Razorpay already has for this Refund.id (pending/processed) is reused;
    // a failed one is not, so a retry after a real failure sends a fresh request.
    const existing = await gateway.findRefund(refund.payment.gatewayPaymentId, refund.id)
    result =
      (existing && existing.status !== 'failed' ? existing : null) ??
      (await gateway.refund({
        refundId: refund.id,
        gatewayPaymentId: refund.payment.gatewayPaymentId,
        amountPaise,
        notes: { orderNumber: refund.order.orderNumber },
      }))
  } catch (e) {
    const lowBalance = isInsufficientBalance(e)
    await fail(lowBalance ? LOW_BALANCE_MESSAGE : gatewayErrorText(e))
    throw new AppError(
      'PAYMENT',
      lowBalance
        ? 'The refund could not be sent: the Razorpay balance is too low. Add funds in Razorpay, then retry.'
        : 'The payment gateway did not accept the refund. It is marked failed and can be retried safely.',
    )
  }

  await audit({
    actor,
    action: 'refund.submitted',
    entityType: 'Refund',
    entityId: refund.id,
    metadata: { gatewayRefundId: result.gatewayRefundId, status: result.status, speedRequested: result.speedRequested },
  })
  return applyGatewayRefund(refund.id, result, 'api', actor)
}

/**
 * Applies what the gateway says about a refund. Monotonic: a late or duplicate
 * message can never move a refund backwards (e.g. "created" after "processed").
 */
export async function applyGatewayRefund(
  refundId: string,
  g: GatewayRefund,
  source: Source,
  actor: Actor | null = null,
): Promise<RefundOutcome> {
  const confirmed = g.status === 'processed' && (source !== 'api' || g.simulated === true)
  if (confirmed) {
    const done = await finalizeRefund(refundId, g, actor)
    return done ? 'processed' : 'already_processed'
  }
  if (g.status === 'failed') {
    await markRefundFailed(refundId, 'Razorpay reported the refund as failed', g)
    return 'failed'
  }
  // pending (or processed but not yet confirmed): remember what the gateway told us
  const current = await db.refund.findUniqueOrThrow({ where: { id: refundId } })
  const canMove =
    current.status === 'NOT_REQUESTED' ||
    current.status === 'REQUESTED' ||
    current.status === 'PROCESSING' ||
    // a request we marked failed (e.g. timeout) that the gateway did create after all
    (current.status === 'FAILED' && !current.gatewayRefundId)
  if (canMove) {
    await db.refund.update({
      where: { id: refundId },
      data: {
        status: 'PROCESSING',
        failureReason: null,
        gatewayRefundId: g.gatewayRefundId,
        speedRequested: g.speedRequested ?? current.speedRequested,
        speedProcessed: g.speedProcessed ?? current.speedProcessed,
        bankReference: g.bankReference ?? current.bankReference,
        requestedAt: current.requestedAt ?? new Date(),
      },
    })
  } else if ((current.status === 'PROCESSED' || current.status === 'CREDITED') && (g.speedProcessed || g.bankReference)) {
    await db.refund.update({
      where: { id: refundId },
      data: { speedProcessed: current.speedProcessed ?? g.speedProcessed, bankReference: current.bankReference ?? g.bankReference },
    })
  }
  return current.status === 'PROCESSED' || current.status === 'CREDITED' ? 'already_processed' : 'pending_gateway'
}

/**
 * Razorpay confirmed it processed the refund (REFUND_PROCESSED). The order stays
 * "refund in progress": processed is not proof that the customer's bank has the
 * money. Returns false if it was already processed/credited.
 */
export async function finalizeRefund(refundId: string, g: GatewayRefund | null, actor: Actor | null): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const r = await tx.refund.updateMany({
      where: { id: refundId, status: { in: ['NOT_REQUESTED', 'REQUESTED', 'PROCESSING', 'FAILED'] } },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        failureReason: null,
        ...(g
          ? {
              gatewayRefundId: g.gatewayRefundId,
              ...(g.speedRequested ? { speedRequested: g.speedRequested } : {}),
              ...(g.speedProcessed ? { speedProcessed: g.speedProcessed } : {}),
              ...(g.bankReference ? { bankReference: g.bankReference } : {}),
            }
          : {}),
      },
    })
    if (!r.count) return false
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { order: true, payment: true } })

    // The PAYMENT is refunded at Razorpay once everything captured has gone back
    const refundedPaise = (
      await tx.refund.findMany({
        where: { paymentId: refund.paymentId, status: { in: ['PROCESSED', 'CREDITED'] } },
        select: { amount: true },
      })
    ).reduce((sum, x) => sum + rupeesToPaise(x.amount), 0)
    if (refundedPaise >= rupeesToPaise(refund.payment.amount)) {
      await tx.payment.update({ where: { id: refund.paymentId }, data: { status: 'REFUNDED' } })
    }
    await publishEvent(tx, {
      type: 'REFUND_UPDATED',
      orderId: refund.orderId,
      forUserId: refund.order.userId,
      forStaff: true,
      payload: { orderNumber: refund.order.orderNumber, status: 'PROCESSED' },
    })
    await audit(
      {
        actor,
        action: 'refund.processed',
        entityType: 'Refund',
        entityId: refundId,
        metadata: { gatewayRefundId: refund.gatewayRefundId, speedProcessed: refund.speedProcessed },
      },
      tx,
    )
    return true
  })
}

/**
 * REFUNDED: authorised staff confirm the customer's bank has the money, with the
 * evidence they relied on (e.g. customer-confirmed bank statement + UTR/ARN).
 * Only from PROCESSED. Records who, when and what.
 */
export async function confirmRefundCredited(actor: Actor, refundId: string, evidence: string) {
  if (actor.role !== 'STAFF' || !actor.permissions?.includes('PAYMENTS')) {
    throw new AppError('FORBIDDEN', 'You do not have permission to confirm refunds.')
  }
  const proof = evidence.trim().slice(0, 500)
  if (proof.length < 8) {
    throw new AppError('VALIDATION', 'Describe the evidence (for example: customer confirmed the credit on their bank statement, UTR …).')
  }
  await db.$transaction(async (tx) => {
    const r = await tx.refund.updateMany({
      where: { id: refundId, status: 'PROCESSED' },
      data: { status: 'CREDITED', creditedAt: new Date(), creditConfirmedById: actor.userId, creditEvidence: proof },
    })
    if (!r.count) {
      const cur = await tx.refund.findUnique({ where: { id: refundId } })
      if (!cur) throw new AppError('NOT_FOUND', 'Refund not found.')
      if (cur.status === 'CREDITED') throw new AppError('CONFLICT', 'This refund is already confirmed as credited.')
      throw new AppError('CONFLICT', 'Only a refund that Razorpay has processed can be confirmed as credited.')
    }
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { order: true } })
    const moved = await tx.order.updateMany({ where: { id: refund.orderId, status: 'REFUND_PENDING' }, data: { status: 'REFUNDED' } })
    if (moved.count) {
      await recordStatusChange(tx, {
        order: refund.order,
        from: 'REFUND_PENDING',
        to: 'REFUNDED',
        actorKind: 'STAFF',
        actorUserId: actor.userId,
        note: 'Bank credit confirmed',
      })
    }
    await publishEvent(tx, {
      type: 'REFUND_UPDATED',
      orderId: refund.orderId,
      forUserId: refund.order.userId,
      forStaff: true,
      payload: { orderNumber: refund.order.orderNumber, status: 'CREDITED' },
    })
    await audit({ actor, action: 'refund.credit_confirmed', entityType: 'Refund', entityId: refundId, metadata: { evidence: proof } }, tx)
  })
}

/** Failed before completing → FAILED (retryable). Failed after PROCESSED/CREDITED → REVERSED. */
export async function markRefundFailed(refundId: string, reason: string, g?: GatewayRefund | null) {
  const current = await db.refund.findUnique({ where: { id: refundId }, include: { order: true } })
  if (!current) return
  const next: RefundStatus = current.status === 'PROCESSED' || current.status === 'CREDITED' ? 'REVERSED' : 'FAILED'
  if (current.status === 'FAILED' || current.status === 'REVERSED') return
  await db.$transaction(async (tx) => {
    await tx.refund.update({
      where: { id: refundId },
      data: {
        status: next,
        failureReason: reason.slice(0, 300),
        ...(g?.gatewayRefundId ? { gatewayRefundId: g.gatewayRefundId } : {}),
      },
    })
    await audit({ action: next === 'REVERSED' ? 'refund.reversed' : 'refund.failed', entityType: 'Refund', entityId: refundId, metadata: { reason } }, tx)
    await publishEvent(tx, {
      type: 'REFUND_UPDATED',
      orderId: current.orderId,
      forUserId: current.order.userId,
      forStaff: true,
      payload: { orderNumber: current.order.orderNumber, status: next },
    })
  })
}

/** Speed fell back from instant to normal (refund.speed_changed). Status is unchanged. */
export async function recordSpeedChange(refundId: string, g: GatewayRefund) {
  await db.refund.updateMany({
    where: { id: refundId },
    data: { ...(g.speedProcessed ? { speedProcessed: g.speedProcessed } : { speedProcessed: 'normal' }) },
  })
}

/**
 * Asks the gateway for the current state of a refund (server-to-server) and
 * applies it. Used by "Check status", the cron and the customer's order page.
 */
export async function syncRefund(refundId: string): Promise<RefundOutcome | 'not_found'> {
  const refund = await db.refund.findUnique({ where: { id: refundId }, include: { payment: true } })
  if (!refund || !refund.payment.gatewayPaymentId || refund.payment.provider === 'SIMULATOR') return 'not_found'
  if (['PROCESSED', 'CREDITED', 'REVERSED', 'NOT_REQUESTED'].includes(refund.status)) {
    return refund.status === 'PROCESSED' || refund.status === 'CREDITED' ? 'already_processed' : 'not_found'
  }
  await db.refund.update({ where: { id: refundId }, data: { checkedAt: new Date() } })
  const gateway = getGatewayFor(refund.payment.provider)
  const g = refund.gatewayRefundId
    ? await gateway.fetchRefund(refund.payment.gatewayPaymentId, refund.gatewayRefundId)
    : await gateway.findRefund(refund.payment.gatewayPaymentId, refund.id)
  if (!g) {
    // A request that never reached the gateway: safe to retry
    if (refund.status === 'REQUESTED' && refund.requestedAt && Date.now() - refund.requestedAt.getTime() > 2 * 60_000) {
      await markRefundFailed(refund.id, 'The refund request did not reach Razorpay. It is safe to retry.')
      return 'failed'
    }
    return 'in_progress'
  }
  return applyGatewayRefund(refund.id, g, 'status_check')
}

/** Refunds still waiting on the gateway (safety net for missed webhooks). */
export async function reconcilePendingRefunds(limit = 25): Promise<number> {
  const rows = await db.refund.findMany({
    where: {
      status: { in: ['REQUESTED', 'PROCESSING'] },
      payment: { provider: { not: 'SIMULATOR' } },
      OR: [{ requestedAt: null }, { requestedAt: { lt: new Date(Date.now() - 2 * 60_000) } }],
    },
    take: limit,
    select: { id: true },
  })
  let n = 0
  for (const r of rows) {
    try {
      await syncRefund(r.id)
      n++
    } catch (e) {
      console.error('[refunds] status check failed', r.id, gatewayErrorText(e))
    }
  }
  return n
}

/**
 * Staff partial refund (e.g. a missing item on a collected order). One refund
 * per payment; never more than captured; the order's status is not changed.
 */
export async function createPartialRefund(
  actor: Actor,
  input: { paymentId: string; amountPaise: number; reason: string },
): Promise<{ refundId: string; outcome: RefundOutcome }> {
  if (actor.role !== 'STAFF' || !actor.permissions?.includes('PAYMENTS')) {
    throw new AppError('FORBIDDEN', 'You do not have permission to issue refunds.')
  }
  const reason = input.reason.trim().slice(0, 200)
  if (!reason) throw new AppError('VALIDATION', 'Enter a reason for the refund.')
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 100) throw new AppError('VALIDATION', 'The minimum refund is ₹1.')
  const payment = await db.payment.findUnique({ where: { id: input.paymentId } })
  if (!payment || payment.status !== 'SUCCEEDED' || !payment.gatewayPaymentId) {
    throw new AppError('CONFLICT', 'Only a successful payment can be refunded.')
  }
  if (input.amountPaise > rupeesToPaise(payment.amount)) throw new AppError('VALIDATION', 'The refund is more than the amount that was paid.')
  const existing = await db.refund.findUnique({ where: { orderId_paymentId: { orderId: payment.orderId, paymentId: payment.id } } })
  if (existing) throw new AppError('CONFLICT', 'This payment already has a refund. Check its status under Refunds.')

  let refundId: string
  try {
    const r = await db.refund.create({
      data: {
        orderId: payment.orderId,
        paymentId: payment.id,
        amount: paiseToDecimalString(input.amountPaise),
        reason,
        initiatedById: actor.userId,
      },
    })
    refundId = r.id
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new AppError('CONFLICT', 'This payment already has a refund.')
    throw e
  }
  await audit({ actor, action: 'refund.partial_created', entityType: 'Refund', entityId: refundId, metadata: { amountPaise: input.amountPaise } })
  return { refundId, outcome: await processRefund(refundId, actor) }
}

/** Finds our refund from a gateway refund entity (id first, then our note/receipt). */
export async function findRefundForGateway(gatewayRefundId: string, ourRefundId: string | null) {
  return (
    (await db.refund.findUnique({ where: { gatewayRefundId } })) ??
    (ourRefundId ? await db.refund.findUnique({ where: { id: ourRefundId } }) : null)
  )
}
