import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { env } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { isUniqueViolation } from '@/lib/tx'
import { rupeesToPaise } from '@/lib/money'
import type { Actor } from '@/lib/auth/guards'
import { confirmPayment, markPaymentFailed, type ConfirmOutcome, type VerifiedVia } from './confirm'
import { getRazorpayGateway } from './gateway'
import { applyGatewayRefund, findRefundForGateway, markRefundFailed, recordSpeedChange } from './refunds'
import { toGatewayRefund } from './gateway'
import { verifyRazorpayCheckoutSignature, verifyRazorpayWebhookSignature } from './signatures'

export const checkoutCallbackSchema = z.object({
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().min(1).max(256),
})

/**
 * Browser callback after Razorpay Checkout. The callback alone is never
 * trusted: we verify the HMAC signature AND fetch the payment from Razorpay's
 * API to check its status, amount and currency before confirming.
 */
export async function verifyRazorpayCheckout(
  actor: Actor,
  input: z.input<typeof checkoutCallbackSchema>,
): Promise<ConfirmOutcome | { outcome: 'pending' } | { outcome: 'failed' }> {
  const parsed = checkoutCallbackSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', 'Invalid payment response.')
  const p = parsed.data
  const payment = await db.payment.findUnique({
    where: { gatewayOrderId: p.razorpay_order_id },
    include: { order: { select: { userId: true } } },
  })
  if (!payment || payment.order.userId !== actor.userId) throw new AppError('NOT_FOUND', 'Payment not found.')

  const ok = verifyRazorpayCheckoutSignature(
    { orderId: p.razorpay_order_id, paymentId: p.razorpay_payment_id, signature: p.razorpay_signature },
    env.razorpay.keySecret,
  )
  if (!ok) {
    await audit({ actor, action: 'payment.invalid_signature', entityType: 'Payment', entityId: payment.id })
    throw new AppError('PAYMENT', 'Payment verification failed. If money was deducted, it will be refunded automatically.')
  }

  const rp = await getRazorpayGateway().fetchPayment(p.razorpay_payment_id)
  if (rp.orderId !== p.razorpay_order_id) throw new AppError('PAYMENT', 'Payment does not match this order.')
  return applyRazorpayPayment(rp, 'checkout_signature')
}

type RazorpayPaymentView = {
  id: string
  orderId: string | null | undefined
  status: string
  amountPaise: number
  currency: string
  method?: string | null
}

/**
 * Applies a payment fetched from Razorpay's API (never from the browser):
 * captured → confirm; authorized → capture first (only if the amount matches
 * our order), then confirm; failed → mark failed; anything else → pending.
 */
async function applyRazorpayPayment(
  rp: RazorpayPaymentView,
  via: VerifiedVia,
): Promise<ConfirmOutcome | { outcome: 'pending' } | { outcome: 'failed' }> {
  const orderId = rp.orderId
  if (!orderId) return { outcome: 'rejected', reason: 'no_order' }
  if (rp.status === 'authorized') {
    const ours = await db.payment.findUnique({ where: { gatewayOrderId: orderId } })
    if (!ours) return { outcome: 'rejected', reason: 'unknown_gateway_order' }
    if (rp.amountPaise !== rupeesToPaise(ours.amount) || rp.currency !== ours.currency) {
      // Not captured → Razorpay releases the authorization back to the customer automatically
      return confirmPayment({ gatewayOrderId: orderId, gatewayPaymentId: rp.id, amountPaise: rp.amountPaise, currency: rp.currency, verifiedVia: via, method: rp.method })
    }
    const c = await getRazorpayGateway().capture(rp.id, rp.amountPaise, rp.currency)
    if (c.status !== 'captured') return { outcome: 'pending' }
    rp = { ...rp, status: 'captured' }
  }
  if (rp.status === 'captured') {
    return confirmPayment({
      gatewayOrderId: orderId,
      gatewayPaymentId: rp.id,
      amountPaise: rp.amountPaise,
      currency: rp.currency,
      verifiedVia: via,
      method: rp.method,
    })
  }
  if (rp.status === 'failed') {
    await markPaymentFailed({ gatewayOrderId: orderId, reason: 'failed' })
    return { outcome: 'failed' }
  }
  return { outcome: 'pending' }
}

/**
 * Asks Razorpay directly which payments were made against an order — used
 * by "Check payment status", the expiry job and the cron as a safety net for
 * a lost browser callback or webhook. Idempotent.
 */
export async function reconcileRazorpayPayment(
  paymentRowId: string,
): Promise<'paid' | 'pending' | 'failed' | 'rejected' | 'not_found'> {
  const payment = await db.payment.findUnique({ where: { id: paymentRowId } })
  if (!payment || payment.provider !== 'RAZORPAY') return 'not_found'
  if (payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED') return 'paid'
  const attempts = await getRazorpayGateway().fetchOrderPayments(payment.gatewayOrderId)
  const best =
    attempts.find((a) => a.status === 'captured') ??
    attempts.find((a) => a.status === 'authorized') ??
    (attempts.length && attempts.every((a) => a.status === 'failed') ? attempts[0] : null)
  if (!best) return 'pending'
  const r = await applyRazorpayPayment(best, 'status_check')
  if (r.outcome === 'confirmed' || r.outcome === 'already_processed' || r.outcome === 'refund_required') return 'paid'
  if (r.outcome === 'failed') return 'failed'
  if (r.outcome === 'pending') return 'pending'
  return 'rejected'
}

/** Reconciles waiting Razorpay payments (optionally only for some orders). */
export async function reconcilePendingRazorpay(opts: { orderIds?: string[]; limit?: number } = {}) {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) return 0
  const rows = await db.payment.findMany({
    where: {
      provider: 'RAZORPAY',
      status: { in: ['CREATED', 'FAILED'] },
      order: { status: 'PAYMENT_PENDING' },
      ...(opts.orderIds ? { orderId: { in: opts.orderIds } } : {}),
    },
    take: opts.limit ?? 25,
    select: { id: true },
  })
  let n = 0
  for (const r of rows) {
    try {
      await reconcileRazorpayPayment(r.id)
      n++
    } catch (e) {
      console.error('[razorpay] status check failed', r.id, e instanceof Error ? e.message : e)
    }
  }
  return n
}

interface RazorpayEntity {
  id: string
  order_id?: string
  amount?: number
  currency?: string
  method?: string
  error_description?: string
  // refund entities
  status?: string
  receipt?: string | null
  notes?: Record<string, unknown> | unknown[]
  speed_requested?: string | null
  speed_processed?: string | null
  acquirer_data?: Record<string, unknown> | null
}

/**
 * Refund webhooks. The signed webhook is Razorpay's own confirmation:
 *   refund.created → PROCESSING · refund.processed → PROCESSED (NOT "Refunded":
 *   that needs confirmed bank credit) · refund.failed → FAILED, or REVERSED if it
 *   had been processed · refund.speed_changed → instant fell back to normal.
 * Out-of-order or repeated events can never move a refund backwards.
 */
async function handleRefundEvent(type: string, entity: RazorpayEntity): Promise<string> {
  const g = toGatewayRefund({
    id: entity.id,
    status: type === 'refund.processed' ? 'processed' : type === 'refund.failed' ? 'failed' : (entity.status ?? 'pending'),
    amount: entity.amount ?? 0,
    receipt: entity.receipt ?? null,
    notes: entity.notes,
    speed_requested: entity.speed_requested,
    speed_processed: entity.speed_processed,
    acquirer_data: entity.acquirer_data,
  })
  const note = entity.notes && !Array.isArray(entity.notes) ? (entity.notes as Record<string, unknown>).refundId : null
  const ours = await findRefundForGateway(entity.id, typeof note === 'string' ? note : (entity.receipt ?? null))
  if (!ours) return 'unknown_refund' // e.g. a refund issued from the Razorpay Dashboard by hand

  if (type === 'refund.speed_changed') {
    await recordSpeedChange(ours.id, g)
    return 'refund_speed_changed'
  }
  if (type === 'refund.failed') {
    await markRefundFailed(ours.id, 'Razorpay reported the refund as failed', g)
    return 'refund_failed'
  }
  if (g.status === 'processed' && type !== 'refund.processed') {
    // e.g. refund.created carrying status processed: record details, wait for refund.processed
    g.status = 'pending'
  }
  const r = await applyGatewayRefund(ours.id, g, 'webhook')
  return r === 'processed' ? 'refund_processed' : r === 'already_processed' ? 'refund_already_processed' : 'refund_processing'
}

/**
 * Razorpay webhook. Authenticity: HMAC of the raw body. Idempotency: the
 * event id is recorded under a unique constraint before processing, so
 * retried deliveries are acknowledged without being processed twice.
 */
export async function handleRazorpayWebhook(
  rawBody: string,
  signature: string | null,
  eventIdHeader: string | null,
): Promise<{ status: number; body: string }> {
  if (!verifyRazorpayWebhookSignature(rawBody, signature, env.razorpay.webhookSecret)) {
    return { status: 400, body: 'invalid signature' }
  }

  let event: { event: string; payload: Record<string, { entity: RazorpayEntity }> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return { status: 400, body: 'invalid json' }
  }
  const eventId = eventIdHeader || createHash('sha256').update(rawBody).digest('hex')

  let record
  try {
    record = await db.webhookEvent.create({
      data: { provider: 'RAZORPAY', eventId, eventType: event.event ?? 'unknown' },
    })
  } catch (e) {
    if (isUniqueViolation(e)) return { status: 200, body: 'duplicate' }
    throw e
  }

  try {
    let result = 'ignored'
    const payment = event.payload?.payment?.entity
    const refund = event.payload?.refund?.entity
    switch (event.event) {
      case 'payment.authorized':
        // Only reached when automatic capture is off: capture after checking the amount
        if (payment?.order_id && payment.amount != null && payment.currency) {
          const r = await applyRazorpayPayment(
            { id: payment.id, orderId: payment.order_id, status: 'authorized', amountPaise: payment.amount, currency: payment.currency, method: payment.method },
            'webhook',
          )
          result = r.outcome
        }
        break
      case 'payment.captured':
      case 'order.paid':
        if (payment?.order_id && payment.amount != null && payment.currency) {
          const r = await confirmPayment({
            gatewayOrderId: payment.order_id,
            gatewayPaymentId: payment.id,
            amountPaise: payment.amount,
            currency: payment.currency,
            verifiedVia: 'webhook',
            method: payment.method,
          })
          result = r.outcome
        }
        break
      case 'payment.failed':
        if (payment?.order_id) {
          await markPaymentFailed({ gatewayOrderId: payment.order_id, reason: payment.error_description ?? 'failed' })
          result = 'marked_failed'
        }
        break
      case 'refund.created':
      case 'refund.processed':
      case 'refund.failed':
      case 'refund.speed_changed':
        if (refund?.id) result = await handleRefundEvent(event.event, refund)
        break
    }
    await db.webhookEvent.update({ where: { id: record.id }, data: { processedAt: new Date(), result } })
    return { status: 200, body: result }
  } catch (e) {
    // Remove the marker so the gateway's retry can process it again
    await db.webhookEvent.delete({ where: { id: record.id } }).catch(() => {})
    console.error('[webhook] processing failed', e)
    return { status: 500, body: 'processing error' }
  }
}
