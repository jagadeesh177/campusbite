import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { PasswordLoginForm } from '@/components/auth/password-login-form'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'

export const metadata: Metadata = { title: 'Staff Login' }
export const dynamic = 'force-dynamic'

/** Staff portal: email + password for accounts created by an administrator. No Google sign-in here. */
export default async function StaffLoginPage() {
  await redirectIfSignedIn()
  return (
    <AuthShell title="Staff Login" subtitle="Sign in with the email and password your administrator gave you.">
      <PasswordLoginForm portal="STAFF" />
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="font-medium hover:text-primary hover:underline">Back to CampusBite</Link>
      </p>
    </AuthShell>
  )
}
