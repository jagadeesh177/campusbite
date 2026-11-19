import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Clock3, ShieldX } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { RecoveryPasswordForm } from '@/components/auth/recovery-password-form'
import { ButtonLink } from '@/components/ui/button'
import { getRecoverySession, RECOVERY_COOKIE } from '@/lib/auth/recovery'

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

/** Only reachable through a verified recovery link (HTTP-only recovery cookie, hard 15-minute expiry). */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams
  const token = (await cookies()).get(RECOVERY_COOKIE)?.value
  const session = await getRecoverySession(token)

  if (session.valid) {
    return (
      <AuthShell title="Choose a new password" subtitle="Enter and confirm your new password.">
        <RecoveryPasswordForm expiresAt={session.expiresAt.toISOString()} email={session.email} />
      </AuthShell>
    )
  }

  const notAllowed = state === 'not_allowed'
  const requestHref = session.email ? `/forgot-password?email=${encodeURIComponent(session.email)}` : '/forgot-password'
  return (
    <AuthShell title={notAllowed ? 'This link can’t be used' : 'This password reset link has expired.'}>
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger-ink">
          {notAllowed ? <ShieldX className="h-7 w-7" aria-hidden /> : <Clock3 className="h-7 w-7" aria-hidden />}
        </div>
        <p className="mt-4 text-sm text-muted">
          {notAllowed
            ? 'This account can’t reset its password here. Please contact the administrator.'
            : 'Reset links work for 15 minutes, and only the newest link works. Request a new one to continue.'}
        </p>
        {!notAllowed && (
          <ButtonLink href={requestHref} size="lg" className="mt-6 w-full">
            Request New Link
          </ButtonLink>
        )}
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  )
}
