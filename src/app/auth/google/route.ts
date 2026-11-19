import { NextResponse } from 'next/server'
import { OAUTH_COOKIE, startGoogleSignIn } from '@/lib/auth/google'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/** "Continue with Google": send the browser to Google (via Supabase Auth, PKCE). */
export async function GET() {
  const start = await startGoogleSignIn()
  const base = env.appUrl.replace(/\/$/, '')
  if (!start) return NextResponse.redirect(`${base}/login?error=google_unavailable`)
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
