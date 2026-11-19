import { NextResponse, type NextRequest } from 'next/server'
import { finishGoogleSignIn, OAUTH_COOKIE, PORTAL_LOGIN_PATH, readState } from '@/lib/auth/google'
import { createSession } from '@/lib/auth/session'
import { PORTAL_HOME } from '@/lib/auth/guards'
import { enforceRateLimit } from '@/lib/auth/rate-limit'
import { getClientInfo } from '@/lib/request'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/** Google sends the user back here. The portal they started from decides who may enter. */
export async function GET(req: NextRequest) {
  const base = env.appUrl.replace(/\/$/, '')
  const state = req.cookies.get(OAUTH_COOKIE)?.value
  const portal = readState(state)?.portal ?? 'USER'
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${base}${PORTAL_LOGIN_PATH[portal]}?error=${reason}`)
    res.cookies.delete(OAUTH_COOKIE)
    return res
  }
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return fail(req.nextUrl.searchParams.get('error') ? 'google_cancelled' : 'google_failed')
  const { ip } = await getClientInfo()
  try {
    if (ip) await enforceRateLimit(`google-callback:${ip}`, 30, 15 * 60)
  } catch {
    return fail('rate_limited')
  }
  const r = await finishGoogleSignIn(code, state)
  if (!r.ok) return fail(r.reason)
  await createSession(r.userId, r.role)
  const res = NextResponse.redirect(`${base}${PORTAL_HOME[r.role]}${r.created ? '?welcome=1' : ''}`)
  res.cookies.delete(OAUTH_COOKIE)
  return res
}
