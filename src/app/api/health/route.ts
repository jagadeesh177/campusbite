import { env } from '@/lib/env'
import { razorpayMode } from '@/lib/payments/gateway'

export const dynamic = 'force-dynamic'

/** Public status check: reports which payment mode is active (never any key). */
export function GET() {
  const provider = env.paymentProvider
  const mode = provider === 'razorpay' ? razorpayMode(env.razorpay.keyId) : 'simulator'
  return Response.json({
    ok: true,
    payments: { provider, mode, liveAllowed: env.razorpay.allowLive, webhookConfigured: Boolean(env.razorpay.webhookSecret) },
  })
}
