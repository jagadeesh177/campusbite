import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'
import { ACCOUNT_NOT_FOUND } from '@/lib/auth/google'

export const metadata: Metadata = { title: 'Sign in' }
export const dynamic = 'force-dynamic'

const NOTICES: Record<string, { tone: 'danger' | 'success' | 'info'; text: string }> = {
  account_not_found: { tone: 'danger', text: ACCOUNT_NOT_FOUND },
  deactivated: { tone: 'danger', text: 'This account has been deactivated. Please contact the administrator.' },
  google_failed: { tone: 'danger', text: 'Google sign-in didn’t complete. Please try again.' },
  google_cancelled: { tone: 'info', text: 'Google sign-in was cancelled.' },
  google_unavailable: { tone: 'danger', text: 'Google sign-in isn’t available right now. Use your email and password.' },
  rate_limited: { tone: 'danger', text: 'Too many attempts. Please wait a few minutes and try again.' },
  reset: { tone: 'success', text: 'Your password has been changed. Sign in with your new password.' },
}

/** The one sign-in page for users, staff and canteen. No sign-up. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string }> }) {
  await redirectIfSignedIn()
  const sp = await searchParams
  const notice = sp.error ? NOTICES[sp.error] : sp.reset ? NOTICES.reset : undefined
  return (
    <AuthShell title="Welcome Back" subtitle="Sign in to your CampusBite account.">
      <LoginForm notice={notice} />
      <p className="mt-8 text-center text-xs text-subtle">
        Accounts are created by the CampusBite administrator. Need access? Contact the canteen office.
      </p>
    </AuthShell>
  )
}
