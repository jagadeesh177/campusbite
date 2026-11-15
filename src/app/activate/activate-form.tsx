'use client'

import { useActionState, useState } from 'react'
import { completeActivationAction, startActivationAction, type FormState } from '@/app/actions/auth'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'

export function ActivateForm({ devMailbox }: { devMailbox: boolean }) {
  const [startState, startAction] = useActionState<FormState, FormData>(startActivationAction, undefined)
  const [completeState, completeAction] = useActionState<FormState, FormData>(completeActivationAction, undefined)
  const [restart, setRestart] = useState(0)
  const onCodeStep = (startState?.step === 'code' || completeState?.step === 'code') && restart === 0
  const email = completeState?.email ?? startState?.email ?? ''

  if (!onCodeStep) {
    return (
      <form action={(fd) => { setRestart(0); startAction(fd) }} className="space-y-5">
        {startState?.error && <Notice tone="danger">{startState.error}</Notice>}
        <Field label="College email" htmlFor="email" hint="Personal email addresses (Gmail etc.) can’t be used.">
          <Input id="email" name="email" type="email" required autoComplete="email" defaultValue={email} placeholder="you@college.edu" />
        </Field>
        <SubmitButton size="lg" className="w-full" pendingText="Checking college records…">
          Send activation code
        </SubmitButton>
      </form>
    )
  }

  return (
    <form action={completeAction} className="space-y-5">
      {startState?.message && !completeState?.error && <Notice tone="success">{startState.message}</Notice>}
      {completeState?.error && <Notice tone="danger">{completeState.error}</Notice>}
      {devMailbox && (
        <Notice tone="info" title="Development mode">
          Emails are not sent in development. Open the{' '}
          <a href="/dev/mailbox" target="_blank" className="font-semibold underline">dev mailbox</a> to read your code.
        </Notice>
      )}
      <input type="hidden" name="email" value={email} />
      <Field label="6-digit code" htmlFor="code">
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="font-mono text-lg tracking-[0.4em]" />
      </Field>
      <Field label="Create a password" htmlFor="password" hint="At least 8 characters with a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Activating…">
        Activate account
      </SubmitButton>
      <button type="button" onClick={() => setRestart((r) => r + 1)} className="w-full text-center text-sm font-medium text-primary hover:underline">
        Use a different email or resend code
      </button>
    </form>
  )
}
