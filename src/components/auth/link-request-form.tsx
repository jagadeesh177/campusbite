'use client'

import { useActionState, useState } from 'react'
import { MailCheck } from 'lucide-react'
import { registerUserAction, requestPasswordResetLinkAction, type LinkRequestState } from '@/app/actions/auth'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'

/**
 * ACTIVATION: user registration with any personal email (name + mobile + optional department).
 * PASSWORD_RESET: email only.
 */
export function LinkRequestForm({ purpose }: { purpose: 'ACTIVATION' | 'PASSWORD_RESET' }) {
  const action = purpose === 'ACTIVATION' ? registerUserAction : requestPasswordResetLinkAction
  const [state, formAction] = useActionState<LinkRequestState, FormData>(action, undefined)
  const [editing, setEditing] = useState(false)
  const v = state?.values

  if (state?.sent && !editing) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card" role="status">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
          <MailCheck className="h-7 w-7" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-semibold">
          {purpose === 'ACTIVATION' ? 'Check your inbox! We’ve sent you an activation link.' : 'Check your inbox'}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {purpose === 'ACTIVATION' ? (
            <>
              We sent it to <strong className="text-ink">{state.email}</strong>. Open the link to create your password — it
              works once and expires in 15 minutes.
            </>
          ) : (
            <>
              If <strong className="text-ink">{state.email}</strong> has a CampusBite user account, we’ve sent a link to set a
              new password. It works once and expires in 15 minutes.
            </>
          )}
        </p>
        <p className="mt-3 text-sm text-muted">
          Don’t see it? Check your Junk/Spam folder. Only one email is sent every 15 minutes.
        </p>
        {purpose === 'ACTIVATION' && (
          <p className="mt-2 text-sm text-muted">
            Already have an account? <a href="/login/user" className="font-semibold text-primary hover:underline">Sign in</a>{' '}
            or <a href="/forgot-password" className="font-semibold text-primary hover:underline">reset your password</a>.
          </p>
        )}
        <div className="mt-5 flex flex-col items-center gap-2">
          {purpose === 'ACTIVATION' && v && (
            <form action={formAction}>
              {Object.entries(v).map(([k, val]) => (
                <input key={k} type="hidden" name={k} value={val} />
              ))}
              <SubmitButton variant="secondary" size="sm" pendingText="Sending…">
                Resend activation email
              </SubmitButton>
            </form>
          )}
          <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-primary hover:underline">
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <form action={(fd) => { setEditing(false); formAction(fd) }} className="space-y-5" noValidate>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Email address" htmlFor="email" hint={purpose === 'ACTIVATION' ? 'Any personal email works — Gmail, Outlook, Yahoo and more.' : undefined}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={state?.email}
          placeholder="Enter your email address"
        />
      </Field>
      {purpose === 'ACTIVATION' && (
        <>
          <Field label="Full name" htmlFor="fullName">
            <Input id="fullName" name="fullName" autoComplete="name" required maxLength={80} defaultValue={v?.fullName} placeholder="Your name" />
          </Field>
          <Field label="Mobile number" htmlFor="phone" hint="Used by the canteen if there’s a problem with your order.">
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required defaultValue={v?.phone} placeholder="10-digit mobile number" />
          </Field>
          <Field label={<>Department <span className="font-normal text-subtle">(optional)</span></>} htmlFor="department">
            <Input id="department" name="department" maxLength={80} defaultValue={v?.department} placeholder="e.g. Computer Science" />
          </Field>
        </>
      )}
      <SubmitButton size="lg" className="w-full" pendingText="Sending…">
        {purpose === 'ACTIVATION' ? 'Activate My Account' : 'Send reset link'}
      </SubmitButton>
    </form>
  )
}
