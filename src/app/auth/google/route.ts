import { NextResponse, type NextRequest } from 'next/server'
import { OAUTH_COOKIE, parsePortal, PORTAL_LOGIN_PATH, startGoogleSignIn } from '@/lib/auth/google'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/** "Continue with Google" for one portal (?portal=user|staff|canteen): send the browser to Google (PKCE). */
export async function GET(req: NextRequest) {
  const portal = parsePortal(req.nextUrl.searchParams.get('portal'))
  const base = env.appUrl.replace(/\/$/, '')
  const start = await startGoogleSignIn(portal)
  if (!start) return NextResponse.redirect(`${base}${PORTAL_LOGIN_PATH[portal]}?error=google_unavailable`)
  const res = NextResponse.redirect(start.url)
  res.cookies.set(OAUTH_COOKIE, start.state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  })
  return res
}
