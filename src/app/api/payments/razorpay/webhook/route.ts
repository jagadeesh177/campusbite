import { handleRazorpayWebhook } from '@/lib/payments/razorpay-handlers'

export const dynamic = 'force-dynamic'

/**
 * Configure in Razorpay Dashboard → Webhooks:
 *   URL: https://<your-domain>/api/payments/razorpay/webhook
 *   Events: payment.captured, payment.failed, order.paid, refund.processed, refund.failed
 *   Secret: same value as RAZORPAY_WEBHOOK_SECRET
 */
export async function POST(req: Request) {
  const raw = await req.text() // signature is computed over the raw body
  const r = await handleRazorpayWebhook(
    raw,
    req.headers.get('x-razorpay-signature'),
    req.headers.get('x-razorpay-event-id'),
  )
  return new Response(r.body, { status: r.status })
}
