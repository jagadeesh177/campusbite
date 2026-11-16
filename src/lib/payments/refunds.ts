import 'server-only'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import { rupeesToPaise } from '@/lib/money'
import { publishEvent } from '@/lib/realtime/publish'
import type { Actor } from '@/lib/auth/guards'
import { recordStatusChange } from '@/lib/orders/events'
import { getGatewayFor } from './gateway'

export type RefundOutcome = 'processed' | 'pending_gateway' | 'already_processed'

/**
 * Sends a refund to the gateway. Claiming the row (PENDING/FAILED → PROCESSING)
 * first guarantees only one caller ever talks to the gateway for a refund.
 * actor = null means the system (automatic refunds).
 */
export async function processRefund(refundId: string, actor: Actor | null): Promise<RefundOutcome> {
  const claim = await db.refund.updateMany({
    where: { id: refundId, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'PROCESSING', failureReason: null },
  })
  if (!claim.count) {
    const r = await db.refund.findUnique({ where: { id: refundId } })
    if (!r) throw new AppError('NOT_FOUND', 'Refund not found.')
    if (r.status === 'PROCESSED') return 'already_processed'
    throw new AppError('CONFLICT', 'This refund is already being processed.')
  }

  const refund = await db.refund.findUniqueOrThrow({
    where: { id: refundId },
    include: { payment: true, order: true },
  })

  if (!refund.payment.gatewayPaymentId) {
    await db.refund.update({
      where: { id: refund.id },
      data: { status: 'FAILED', failureReason: 'Payment has no gateway payment id' },
    })
    throw new AppError('PAYMENT', 'This payment cannot be refunded automatically.')
  }

  let result
  try {
    result = await getGatewayFor(refund.payment.provider).refund({
      gatewayPaymentId: refund.payment.gatewayPaymentId,
      amountPaise: rupeesToPaise(refund.amount),
      notes: { refundId: refund.id, orderNumber: refund.order.orderNumber },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.refund.update({
      where: { id: refund.id },
      data: { status: 'FAILED', failureReason: message.slice(0, 300) },
    })
    await audit({
      actor,
      action: 'refund.failed',
      entityType: 'Refund',
      entityId: refund.id,
      metadata: { error: message.slice(0, 300) },
    })
    throw new AppError('PAYMENT', 'The payment gateway did not accept the refund. It is marked failed and can be retried.')
  }

  if (result.processed) {
    await finalizeRefund(refund.id, result.gatewayRefundId, actor)
    return 'processed'
  }

  // Accepted by the gateway but settles later — the refund.processed webhook finalizes it.
  await db.refund.update({ where: { id: refund.id }, data: { gatewayRefundId: result.gatewayRefundId } })
  await audit({
    actor,
    action: 'refund.submitted',
    entityType: 'Refund',
    entityId: refund.id,
    metadata: { gatewayRefundId: result.gatewayRefundId },
  })
  return 'pending_gateway'
}

export async function finalizeRefund(refundId: string, gatewayRefundId: string | null, actor: Actor | null) {
  await db.$transaction(async (tx) => {
    const r = await tx.refund.updateMany({
      where: { id: refundId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        ...(gatewayRefundId ? { gatewayRefundId } : {}),
      },
    })
    if (!r.count) return
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { order: true } })
    await tx.payment.update({ where: { id: refund.paymentId }, data: { status: 'REFUNDED' } })
    const moved = await tx.order.updateMany({
      where: { id: refund.orderId, status: 'REFUND_PENDING' },
      data: { status: 'REFUNDED' },
    })
    if (moved.count) {
      await recordStatusChange(tx, {
        order: refund.order,
        from: 'REFUND_PENDING',
        to: 'REFUNDED',
        actorKind: actor ? 'STAFF' : 'SYSTEM',
        actorUserId: actor?.userId,
      })
    }
    await publishEvent(tx, {
      type: 'REFUND_UPDATED',
      orderId: refund.orderId,
      forUserId: refund.order.userId,
      forStaff: true,
      payload: { orderNumber: refund.order.orderNumber, status: 'PROCESSED' },
    })
    await audit(
      { actor, action: 'refund.processed', entityType: 'Refund', entityId: refundId, metadata: { gatewayRefundId } },
      tx,
    )
  })
}

export async function finalizeRefundByGatewayId(gatewayRefundId: string) {
  const refund = await db.refund.findUnique({ where: { gatewayRefundId } })
  if (refund) await finalizeRefund(refund.id, gatewayRefundId, null)
}

export async function failRefundByGatewayId(gatewayRefundId: string, reason: string) {
  await db.refund.updateMany({
    where: { gatewayRefundId, status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'FAILED', failureReason: reason.slice(0, 300) },
  })
}
