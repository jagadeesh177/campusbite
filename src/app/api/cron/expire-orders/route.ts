import { timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'
import { expireStalePendingOrders } from '@/lib/orders/expire'
import { reconcilePendingRazorpay } from '@/lib/payments/razorpay-handlers'
import { reconcilePendingRefunds } from '@/lib/payments/refunds'
import { purgeExpiredTechnicalRows } from '@/lib/maintenance'

export const dynamic = 'force-dynamic'

/** Called by Vercel Cron (see vercel.json) with "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: Request) {
  const expected = `Bearer ${env.cronSecret}`
  const got = req.headers.get('authorization') ?? ''
  if (!env.cronSecret || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return new Response('Unauthorized', { status: 401 })
  }
  const reconciled = await reconcilePendingRazorpay() // safety net for missed webhooks
  const refundsChecked = await reconcilePendingRefunds() // refunds still waiting on Razorpay
  const expired = await expireStalePendingOrders()
  const purged = await purgeExpiredTechnicalRows()
  return Response.json({ expired, reconciled, refundsChecked, purged })
}
