import { NextResponse, type NextRequest } from 'next/server'
import { finishGoogleSignIn, OAUTH_COOKIE } from '@/lib/auth/google'
import { createSession } from '@/lib/auth/session'
import { PORTAL_HOME } from '@/lib/auth/guards'
import { enforceRateLimit } from '@/lib/auth/rate-limit'
import { getClientInfo } from '@/lib/request'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/** Google sends the user back here. Sign-in only: unknown accounts are refused. */
export async function GET(req: NextRequest) {
  const base = env.appUrl.replace(/\/$/, '')
  const code = req.nextUrl.searchParams.get('code')
  const state = req.cookies.get(OAUTH_COOKIE)?.value
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${base}/login?error=${reason}`)
    res.cookies.delete(OAUTH_COOKIE)
    return res
  }
  if (!code) return fail(req.nextUrl.searchParams.get('error') ? 'google_cancelled' : 'google_failed')
  const { ip } = await getClientInfo()
  try {
    if (ip) await enforceRateLimit(`google-callback:${ip}`, 30, 15 * 60)
  } catch {
    return fail('rate_limited')
  }
  const r = await finishGoogleSignIn(code, state)
  if (!r.ok) return fail(r.reason === 'not_found' ? 'account_not_found' : r.reason === 'deactivated' ? 'deactivated' : 'google_failed')
  await createSession(r.userId, r.role, { remember: true })
  const res = NextResponse.redirect(`${base}${PORTAL_HOME[r.role]}`)
  res.cookies.delete(OAUTH_COOKIE)
  return res
}
