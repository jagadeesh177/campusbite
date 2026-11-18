import 'server-only'
import { db } from '@/lib/db'
import { reconcilePendingRazorpay } from '@/lib/payments/razorpay-handlers'
import { recordStatusChange } from './events'

export const PAYMENT_WINDOW_MINUTES = 30

/**
 * Cancels orders whose payment was never completed. Runs from the cron
 * endpoint and opportunistically before checkout / on the kitchen board.
 * If a payment for an expired order arrives later, confirmPayment() moves it
 * to REFUND_PENDING instead of confirming it.
 */
export async function expireStalePendingOrders(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PAYMENT_WINDOW_MINUTES * 60_000)
  const stale = await db.order.findMany({
    where: { status: 'PAYMENT_PENDING', createdAt: { lt: cutoff } },
    select: { id: true, orderNumber: true, userId: true },
    take: 200,
  })
  // Before cancelling, ask Razorpay whether any of these were actually paid
  // (a lost callback/webhook must not turn a paid order into a refund).
  if (stale.length) {
    await reconcilePendingRazorpay({ orderIds: stale.slice(0, 10).map((o) => o.id), limit: 10 }).catch(() => 0)
  }
  let expired = 0
  for (const order of stale) {
    await db.$transaction(async (tx) => {
      const r = await tx.order.updateMany({
        where: { id: order.id, status: 'PAYMENT_PENDING' },
        data: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'Payment not completed in time' },
      })
      if (!r.count) return
      await tx.payment.updateMany({
        where: { orderId: order.id, status: 'CREATED' },
        data: { status: 'FAILED', failureReason: 'expired' },
      })
      await recordStatusChange(tx, {
        order,
        from: 'PAYMENT_PENDING',
        to: 'CANCELLED',
        actorKind: 'SYSTEM',
        note: 'Payment not completed in time',
      })
      expired++
    })
  }
  return expired
}
