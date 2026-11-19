import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldX } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { SetPasswordForm } from '@/components/auth/set-password-form'
import { HashConfirm } from '@/components/auth/hash-confirm'
import { RecoveryContinue } from '@/components/auth/recovery-continue'
import { ButtonLink } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Your CampusBite account',
  // The token is in the URL — never leak it via the Referer header
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

const TYPES = ['email', 'recovery', 'signup', 'magiclink']

/**
 * Landing page for the links Supabase Auth emails: activation of a staff-created
 * account, and password reset. Opening this page does NOT use the link — only
 * pressing the button does — so email scanners that pre-open links can't burn it.
 * Supabase enforces single use when it verifies the token.
 */
export default async function ConfirmLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; error_description?: string }>
}) {
  const { token_hash, type, error_description } = await searchParams
  const ok = token_hash && /^[A-Za-z0-9_-]{8,200}$/.test(token_hash) && type && TYPES.includes(type)

  const invalid = (
    <>
        <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger-ink">
            <ShieldX className="h-7 w-7" aria-hidden />
          </div>
          <p className="mt-4 text-sm text-muted">
            {error_description
              ? 'This link has expired or has already been used.'
              : 'It may be incomplete or mistyped.'}{' '}
            Request a new link and use the newest email.
          </p>
          <div className="mt-6 grid gap-2">
            <ButtonLink href="/forgot-password" size="lg">Request New Link</ButtonLink>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-primary hover:underline">Back to sign in</Link>
        </p>
    </>
  )

  // Supabase's default email links arrive with the session in the URL fragment (#access_token=…)
  if (!token_hash && !error_description) {
    return (
      <AuthShell title="Your CampusBite account">
        <HashConfirm invalid={invalid} />
      </AuthShell>
    )
  }

  if (!ok) {
    return <AuthShell title="This link isn’t valid">{invalid}</AuthShell>
  }

  if (type === 'recovery') {
    return (
      <AuthShell title="Reset your password" subtitle="Continue to choose a new password for your CampusBite account.">
        <RecoveryContinue token={token_hash!} />
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Create Your Password" subtitle="Last step — choose a password to activate your CampusBite account.">
      <SetPasswordForm token={token_hash!} type={type!} purpose="ACTIVATION" />
    </AuthShell>
  )
}
