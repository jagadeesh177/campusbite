import type { Metadata } from 'next'
import { CheckCircle2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { ButtonLink } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Account deleted', robots: { index: false, follow: false } }

export default function GoodbyePage() {
  return (
    <AuthShell title="Your account has been deleted" subtitle="Thanks for using CampusBite.">
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft text-success">
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </div>
        <p className="mt-4 text-sm text-muted">
          Your personal details and login have been permanently removed. Past orders are kept only as anonymous records
          for the canteen&apos;s accounts.
        </p>
        <div className="mt-6 grid gap-2">
          <ButtonLink href="/" size="lg">Back to home</ButtonLink>
          <ButtonLink href="/activate" variant="secondary">Create a new account</ButtonLink>
        </div>
      </div>
    </AuthShell>
  )
}
