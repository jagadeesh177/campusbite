import { NextResponse } from 'next/server'
import { requireActor } from '@/lib/auth/guards'
import { AppError } from '@/lib/errors'
import { env } from '@/lib/env'
import { verifyRazorpayCheckout } from '@/lib/payments/razorpay-handlers'

export const dynamic = 'force-dynamic'

/** Same-origin JSON endpoint called by the Razorpay Checkout handler. */
export async function POST(req: Request) {
  // CSRF: browsers always send Origin on cross-site POSTs
  const origin = req.headers.get('origin')
  if (origin && new URL(origin).host !== new URL(req.url).host && origin !== new URL(env.appUrl).origin) {
    return NextResponse.json({ error: 'Bad origin' }, { status: 403 })
  }
  try {
    const actor = await requireActor('USER')
    const body = await req.json().catch(() => ({}))
    const r = await verifyRazorpayCheckout(actor, body)
    if (r.outcome === 'rejected') return NextResponse.json({ error: 'Payment could not be verified.' }, { status: 400 })
    if (r.outcome === 'failed') return NextResponse.json({ error: 'The payment failed. No money was taken — you can try again.' }, { status: 402 })
    return NextResponse.json({ outcome: r.outcome, orderId: 'orderId' in r ? r.orderId : undefined })
  } catch (e) {
    if (e instanceof AppError) {
      const status = e.code === 'UNAUTHORIZED' ? 401 : e.code === 'NOT_FOUND' ? 404 : 400
      return NextResponse.json({ error: e.message }, { status })
    }
    console.error('[razorpay/verify]', e)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
