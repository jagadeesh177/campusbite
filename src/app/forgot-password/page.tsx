import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { LinkRequestForm } from '@/components/auth/link-request-form'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'

export const metadata: Metadata = { title: 'Reset your password' }
export const dynamic = 'force-dynamic'

/** Users only. Staff and canteen passwords are reset by an administrator. */
export default async function ForgotPasswordPage() {
  await redirectIfSignedIn()
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we’ll send you a secure reset link.">
      <LinkRequestForm purpose="PASSWORD_RESET" />
      <p className="mt-8 text-center text-sm text-muted">
        Remembered it? <Link href="/login/user" className="font-medium text-primary hover:underline">Back to sign in</Link>
      </p>
      <p className="mt-2 text-center text-xs text-subtle">Staff and canteen accounts: ask your administrator to reset your password.</p>
    </AuthShell>
  )
}
