import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// Self-hosted variable fonts (no runtime or build-time calls to Google)
const inter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
})
const jakarta = localFont({
  src: '../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
  variable: '--font-jakarta',
  weight: '200 800',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'CampusBite — Skip the queue. Enjoy your break.',
    template: '%s · CampusBite',
  },
  description:
    'Order campus canteen food from anywhere on campus, pay online with UPI, track your order and pick it up when it is ready.',
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = {
  themeColor: '#173F35',
  width: 'device-width',
  initialScale: 1,
  // Let iPhones report safe-area insets (notch / Dynamic Island / home indicator)
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="min-h-dvh bg-bg text-ink antialiased">{children}</body>
    </html>
  )
}
