'use client'

import { useActionState } from 'react'
import { MailCheck } from 'lucide-react'
import { requestPasswordResetLinkAction, type LinkRequestState } from '@/app/actions/auth'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'

/** Same answer whether or not the email has an account (no enumeration). */
export function ForgotPasswordForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, action] = useActionState<LinkRequestState, FormData>(requestPasswordResetLinkAction, undefined)

  if (state?.sent) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card" role="status">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
          <MailCheck className="h-7 w-7" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Check your inbox</h2>
        <p className="mt-2 text-sm text-muted">
          If <strong className="text-ink">{state.email}</strong> belongs to a CampusBite account, we’ve sent a link to reset
          the password. It expires in 15 minutes.
        </p>
        <p className="mt-3 text-sm text-muted">Don’t see it? Check your Junk/Spam folder.</p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Registered email address" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state?.email ?? defaultEmail}
          placeholder="you@example.com"
        />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  )
}
