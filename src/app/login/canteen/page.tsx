import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'

export const metadata: Metadata = { title: 'Canteen login' }

export default async function CanteenLoginPage() {
  await redirectIfSignedIn()
  return (
    <AuthShell
      title="Canteen portal"
      subtitle="Sign in to see incoming orders and verify pickups."
      aside={{ heading: 'A calmer kitchen rush.', points: ['Every paid order in one board', 'Big, simple buttons for each step', 'Scan pickup codes at the counter'] }}
    >
      <LoginForm portal="CANTEEN" emailPlaceholder="kitchen@college.edu" />
      <p className="mt-6 text-center text-sm text-muted">
        Need an account? Ask the canteen administrator. <Link href="/login" className="font-medium text-primary hover:underline">Other portals</Link>
      </p>
    </AuthShell>
  )
}
