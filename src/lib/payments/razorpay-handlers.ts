import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { env } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { isUniqueViolation } from '@/lib/tx'
import type { Actor } from '@/lib/auth/guards'
import { confirmPayment, markPaymentFailed, type ConfirmOutcome } from './confirm'
import { getRazorpayGateway } from './gateway'
import { failRefundByGatewayId, finalizeRefundByGatewayId } from './refunds'
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
): Promise<ConfirmOutcome | { outcome: 'pending' }> {
  const p = checkoutCallbackSchema.parse(input)
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
  if (rp.status !== 'captured') return { outcome: 'pending' } // webhook will complete it

  return confirmPayment({
    gatewayOrderId: p.razorpay_order_id,
    gatewayPaymentId: rp.id,
    amountPaise: rp.amountPaise,
    currency: rp.currency,
    verifiedVia: 'checkout_signature',
    method: rp.method,
  })
}

interface RazorpayEntity {
  id: string
  order_id?: string
  amount?: number
  currency?: string
  method?: string
  error_description?: string
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
      case 'refund.processed':
        if (refund?.id) {
          await finalizeRefundByGatewayId(refund.id)
          result = 'refund_processed'
        }
        break
      case 'refund.failed':
        if (refund?.id) {
          await failRefundByGatewayId(refund.id, 'Gateway reported refund failure')
          result = 'refund_failed'
        }
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
