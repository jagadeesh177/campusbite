import 'server-only'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { rupeesToPaise } from '@/lib/money'
import { publishEvent } from '@/lib/realtime/publish'
import { withTxRetry } from '@/lib/tx'
import { generatePickupToken } from '@/lib/orders/codes'
import { recordStatusChange } from '@/lib/orders/events'
import { processRefund } from './refunds'

export type VerifiedVia = 'checkout_signature' | 'webhook' | 'simulator'

export interface ConfirmPaymentInput {
  gatewayOrderId: string
  gatewayPaymentId: string
  amountPaise: number
  currency: string
  verifiedVia: VerifiedVia
  method?: string | null
}

export type ConfirmOutcome =
  | { outcome: 'confirmed'; orderId: string }
  | { outcome: 'already_processed'; orderId: string }
  | { outcome: 'refund_required'; orderId: string; refundId: string }
  | { outcome: 'rejected'; orderId?: string; reason: string }

/**
 * Marks a gateway payment as successful and confirms its order.
 *
 * Callers MUST have verified authenticity first (checkout signature + server
 * lookup, webhook signature, or simulator signature). This function is
 * idempotent: a row lock on the payment serializes concurrent deliveries of
 * the same event, and repeated calls are no-ops.
 */
export async function confirmPayment(p: ConfirmPaymentInput): Promise<ConfirmOutcome> {
  const result = await withTxRetry(() =>
    db.$transaction(async (tx): Promise<ConfirmOutcome> => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Payment" WHERE "gatewayOrderId" = ${p.gatewayOrderId} FOR UPDATE`
      if (!locked.length) return { outcome: 'rejected', reason: 'unknown_gateway_order' }

      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: locked[0].id },
        include: { order: true },
      })
      const order = payment.order

      if (payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED') {
        if (payment.gatewayPaymentId && payment.gatewayPaymentId !== p.gatewayPaymentId) {
          // A second, different capture for the same order. Flag for staff.
          await audit(
            {
              action: 'payment.duplicate_capture',
              entityType: 'Payment',
              entityId: payment.id,
              metadata: { existing: payment.gatewayPaymentId, incoming: p.gatewayPaymentId },
            },
            tx,
          )
          return { outcome: 'rejected', orderId: order.id, reason: 'duplicate_capture' }
        }
        return { outcome: 'already_processed', orderId: order.id }
      }

      if (p.amountPaise !== rupeesToPaise(payment.amount) || p.currency !== payment.currency) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', failureReason: 'amount_or_currency_mismatch' },
        })
        await audit(
          {
            action: 'payment.amount_mismatch',
            entityType: 'Payment',
            entityId: payment.id,
            metadata: { expectedPaise: rupeesToPaise(payment.amount), receivedPaise: p.amountPaise, currency: p.currency },
          },
          tx,
        )
        return { outcome: 'rejected', orderId: order.id, reason: 'amount_mismatch' }
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCEEDED',
          gatewayPaymentId: p.gatewayPaymentId,
          verifiedVia: p.verifiedVia,
          method: p.method ?? null,
          verifiedAt: new Date(),
          failureReason: null,
        },
      })
      await audit(
        {
          action: 'payment.succeeded',
          entityType: 'Payment',
          entityId: payment.id,
          metadata: { orderNumber: order.orderNumber, amountPaise: p.amountPaise, verifiedVia: p.verifiedVia },
        },
        tx,
      )

      // Compare-and-set: the order may have been expired concurrently
      const confirmed = await tx.order.updateMany({
        where: { id: order.id, status: 'PAYMENT_PENDING' },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      })

      if (confirmed.count === 1) {
        let token = generatePickupToken()
        for (let i = 0; i < 5 && (await tx.pickupToken.findUnique({ where: { token } })); i++) {
          token = generatePickupToken()
        }
        await tx.pickupToken.create({ data: { orderId: order.id, token } })
        await recordStatusChange(tx, {
          order,
          from: 'PAYMENT_PENDING',
          to: 'CONFIRMED',
          actorKind: 'SYSTEM',
          note: `Payment verified (${p.verifiedVia})`,
        })
        return { outcome: 'confirmed', orderId: order.id }
      }

      // Money arrived for an order that is no longer awaiting payment
      const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } })
      if (current.status === 'CANCELLED') {
        await tx.order.update({ where: { id: order.id }, data: { status: 'REFUND_PENDING' } })
        const refund = await tx.refund.create({
          data: {
            orderId: order.id,
            paymentId: payment.id,
            amount: payment.amount,
            reason: 'Payment received after the order had expired',
          },
        })
        await recordStatusChange(tx, {
          order,
          from: 'CANCELLED',
          to: 'REFUND_PENDING',
          actorKind: 'SYSTEM',
          note: 'Payment received after the order had expired',
        })
        return { outcome: 'refund_required', orderId: order.id, refundId: refund.id }
      }

      await audit(
        {
          action: 'payment.unexpected_order_state',
          entityType: 'Order',
          entityId: order.id,
          metadata: { status: current.status, paymentId: payment.id },
        },
        tx,
      )
      return { outcome: 'rejected', orderId: order.id, reason: 'unexpected_order_state' }
    }),
  )

  if (result.outcome === 'refund_required') {
    try {
      await processRefund(result.refundId, null)
    } catch (e) {
      console.error('[payments] automatic refund failed; left for staff', e)
    }
  }
  return result
}

/** A failed attempt does not cancel the order — the student can retry until it expires. */
export async function markPaymentFailed(p: { gatewayOrderId: string; reason: string }) {
  const payment = await db.payment.findUnique({
    where: { gatewayOrderId: p.gatewayOrderId },
    include: { order: { select: { id: true, userId: true, orderNumber: true } } },
  })
  if (!payment) return
  await db.$transaction(async (tx) => {
    const r = await tx.payment.updateMany({
      where: { id: payment.id, status: 'CREATED' },
      data: { status: 'FAILED', failureReason: p.reason.slice(0, 200) },
    })
    if (!r.count) return
    await publishEvent(tx, {
      type: 'PAYMENT_FAILED',
      orderId: payment.order.id,
      studentUserId: payment.order.userId,
      forStaff: true,
      payload: { orderNumber: payment.order.orderNumber },
    })
  })
}
