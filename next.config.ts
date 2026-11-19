import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'

// Razorpay Checkout runs in an iframe/script from razorpay.com.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.razorpay.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
  'frame-src https://api.razorpay.com https://checkout.razorpay.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera is used by the canteen pickup scanner (same-origin only)
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  experimental: {
    serverActions: { bodySizeLimit: '2mb' }, // food photo uploads
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  // The STUDENT role became USER: keep old links and bookmarks working
  async redirects() {
    return [
      // Google sign-in only: old password / sign-up / reset pages go to the login page
      { source: '/login/student', destination: '/login', permanent: true },
      { source: '/login/user', destination: '/login', permanent: true },
      { source: '/login/kitchen', destination: '/login/canteen', permanent: true },
      { source: '/activate', destination: '/login', permanent: true },
      { source: '/signup', destination: '/login', permanent: true },
      { source: '/forgot-password', destination: '/login', permanent: true },
      { source: '/reset-password', destination: '/login', permanent: true },
      { source: '/auth/confirm', destination: '/login', permanent: true },
      { source: '/account/password', destination: '/', permanent: true },
      { source: '/student', destination: '/user/dashboard', permanent: true },
      { source: '/student/:path*', destination: '/user/:path*', permanent: true },
      { source: '/staff/students', destination: '/staff/users', permanent: true },
      { source: '/staff/students/:path*', destination: '/staff/users/:path*', permanent: true },
      // Simplified user portal: menu lives on Home, history on My Orders, checkout on Cart
      { source: '/user/menu', destination: '/user/dashboard', permanent: true },
      { source: '/user/history', destination: '/user/orders', permanent: true },
      { source: '/user/checkout', destination: '/user/cart', permanent: true },
      // Kitchen settings live in the staff portal; the canteen board has a pause/resume switch
      { source: '/canteen/settings', destination: '/canteen/dashboard', permanent: false },
    ]
  },
}

export default nextConfig
