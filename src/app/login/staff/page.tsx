import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'

export const metadata: Metadata = { title: 'Staff login' }

export default async function StaffLoginPage() {
  await redirectIfSignedIn()
  return (
    <AuthShell
      title="Staff & admin portal"
      subtitle="For authorised college staff. Accounts are created by an administrator."
      aside={{ heading: 'Run the canteen with clarity.', points: ['Live sales and order reports', 'Payments and refunds in one place', 'Accounts, permissions and audit logs'] }}
    >
      <LoginForm portal="STAFF" emailPlaceholder="name@college.edu" />
      <p className="mt-6 text-center text-sm text-muted">
        Not staff? <Link href="/login" className="font-medium text-primary hover:underline">Choose another portal</Link>
      </p>
    </AuthShell>
  )
}
