import { NextResponse, type NextRequest } from 'next/server'

// First line of defence only: bounces visitors without a session cookie away
// from portal routes. Real authentication + role checks run server-side in
// every portal layout, page, server action and API route.

const PORTALS: Record<string, string> = {
  '/student': '/login/student',
  '/canteen': '/login/canteen',
  '/staff': '/login/staff',
}

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has('cb_session') || req.cookies.has('__Host-cb_session')
  const { pathname } = req.nextUrl
  const portal = Object.keys(PORTALS).find((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (portal && !hasSession) {
    return NextResponse.redirect(new URL(PORTALS[portal], req.url))
  }
  if (pathname.startsWith('/account') && !hasSession) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/student/:path*', '/canteen/:path*', '/staff/:path*', '/account/:path*'],
}
