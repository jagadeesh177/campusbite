import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, LinkIcon, ShieldX } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { SetPasswordForm } from '@/components/auth/set-password-form'
import { ButtonLink } from '@/components/ui/button'
import { inspectStudentToken, LINK_TTL_MINUTES } from '@/lib/auth/activation'

export const metadata: Metadata = {
  title: 'Create your password',
  // The token is in the URL — never leak it via the Referer header
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

const PROBLEM = {
  invalid: { Icon: ShieldX, title: 'This link isn’t valid', text: 'It may be incomplete or mistyped. Request a new link and use the newest email.' },
  expired: { Icon: Clock, title: 'This link has expired', text: `Links work for ${LINK_TTL_MINUTES} minutes. Request a new one — it only takes a moment.` },
  used: { Icon: LinkIcon, title: 'This link has already been used', text: 'Each link works once, and a newer request replaces older links. If your account is active, just sign in.' },
} as const

export default async function ConfirmLinkPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const result = await inspectStudentToken(token)

  if (!result.valid) {
    const p = PROBLEM[result.reason]
    return (
      <AuthShell title={p.title}>
        <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger-ink">
            <p.Icon className="h-7 w-7" aria-hidden />
          </div>
          <p className="mt-4 text-sm text-muted">{p.text}</p>
          <div className="mt-6 grid gap-2">
            <ButtonLink href="/activate" size="lg">Request a new activation link</ButtonLink>
            <ButtonLink href="/forgot-password" variant="secondary">Reset my password instead</ButtonLink>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/login/student" className="font-medium text-primary hover:underline">Back to sign in</Link>
        </p>
      </AuthShell>
    )
  }

  const activation = result.purpose === 'ACTIVATION'
  return (
    <AuthShell
      title={activation ? 'Create Your Password' : 'Choose a new password'}
      subtitle={
        <>
          {activation ? 'Activating' : 'Resetting'} <strong className="text-ink">{result.email}</strong>. This link expires in {LINK_TTL_MINUTES} minutes.
        </>
      }
    >
      <SetPasswordForm token={token!} purpose={result.purpose} />
    </AuthShell>
  )
}
