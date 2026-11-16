'use client'

import { useActionState, useState } from 'react'
import { MailCheck } from 'lucide-react'
import {
  requestActivationLinkAction,
  requestPasswordResetLinkAction,
  type LinkRequestState,
} from '@/app/actions/auth'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'

export function LinkRequestForm({
  purpose,
  devMailbox,
}: {
  purpose: 'ACTIVATION' | 'PASSWORD_RESET'
  devMailbox: boolean
}) {
  const action = purpose === 'ACTIVATION' ? requestActivationLinkAction : requestPasswordResetLinkAction
  const [state, formAction] = useActionState<LinkRequestState, FormData>(action, undefined)
  const [editing, setEditing] = useState(false)

  if (state?.sent && !editing) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card" role="status">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
          <MailCheck className="h-7 w-7" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Check your inbox</h2>
        <p className="mt-2 text-sm text-muted">
          If <strong className="text-ink">{state.email}</strong>{' '}
          {purpose === 'ACTIVATION'
            ? 'belongs to an eligible student who hasn’t activated yet, we’ve sent an activation link.'
            : 'has an active CampusBite student account, we’ve sent a password reset link.'}{' '}
          It expires in 15 minutes and works once.
        </p>
        <p className="mt-3 text-sm text-muted">
          Only one link is sent every 15 minutes — if you already requested one, use that email. Don’t see it? Check
          your Junk/Spam folder.
        </p>
        {devMailbox && (
          <Notice tone="info" title="Development mode" className="mt-4 text-left">
            Emails aren’t sent in development. Open the{' '}
            <a href="/dev/mailbox" target="_blank" className="font-semibold underline">dev mailbox</a> to find the link.
          </Notice>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-5 text-sm font-semibold text-primary hover:underline"
        >
          Use a different email or send again
        </button>
      </div>
    )
  }

  return (
    <form action={(fd) => { setEditing(false); formAction(fd) }} className="space-y-5" noValidate>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <Field
        label="College email"
        htmlFor="email"
        hint="Use your official college email — personal addresses (Gmail etc.) can’t be used."
      >
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={state?.email}
          placeholder="you@college.edu"
        />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Checking college records…">
        {purpose === 'ACTIVATION' ? 'Verify My Email' : 'Send reset link'}
      </SubmitButton>
    </form>
  )
}
