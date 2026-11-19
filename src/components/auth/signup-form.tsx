'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Check, Eye, EyeOff, MailCheck, X } from 'lucide-react'
import { signupAction, type SignupState } from '@/app/actions/auth'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'
import { cn } from '@/lib/cn'
import { PASSWORD_RULES, strength } from './set-password-form'
import { GoogleButton } from './login-form'

/** Step 1: name, Gmail, password. Step 2: the code from the email. */
export function SignupForm() {
  const [state, action] = useActionState<SignupState, FormData>(signupAction, undefined)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)

  if (state?.step === 'code') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-line bg-surface p-5 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
            <MailCheck className="h-6 w-6" aria-hidden />
          </div>
          <p className="mt-3 text-sm text-muted">
            We sent a code to <strong className="text-ink">{state.email}</strong>. Enter it below. It expires in 15 minutes.
          </p>
          <p className="mt-1 text-xs text-subtle">Not in your inbox? Check Spam/Promotions.</p>
        </div>
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        {state.message && <Notice tone="success">{state.message}</Notice>}
        <form action={action} className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="verify" />
          <Field label="Verification code" htmlFor="code">
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              required
              autoFocus
              placeholder="Code from the email"
              className="text-center font-mono text-lg tracking-[0.4em]"
            />
          </Field>
          <SubmitButton size="lg" className="w-full" pendingText="Verifying…">
            Verify &amp; create account
          </SubmitButton>
        </form>
        <form action={action} className="text-center">
          <input type="hidden" name="intent" value="resend" />
          <SubmitButton variant="ghost" size="sm" pendingText="Sending…">
            Send a new code
          </SubmitButton>
        </form>
      </div>
    )
  }

  const meetsRules = PASSWORD_RULES.every((r) => r.test(password))
  const matches = confirm.length > 0 && confirm === password
  const s = strength(password)
  const barColor = ['bg-line', 'bg-danger', 'bg-warning', 'bg-accent', 'bg-success'][s.score]

  return (
    <div className="space-y-5">
      <GoogleButton />
      <div className="flex items-center gap-3 text-xs font-semibold tracking-wide text-subtle uppercase" role="separator">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="intent" value="details" />
        {state?.error && <Notice tone="danger">{state.error}</Notice>}
        <Field label="Full name" htmlFor="fullName">
          <Input id="fullName" name="fullName" autoComplete="name" required maxLength={80} defaultValue={state?.values?.fullName} />
        </Field>
        <Field label="Gmail address" htmlFor="email" hint="Only @gmail.com addresses">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="yourname@gmail.com"
            defaultValue={state?.values?.email}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-12"
              aria-describedby="password-rules"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary"
              aria-label={show ? 'Hide password' : 'Show password'}
              aria-pressed={show}
            >
              {show ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </button>
          </div>
        </Field>
        <div aria-live="polite">
          <div className="flex gap-1.5" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={cn('h-1.5 flex-1 rounded-full', i <= s.score ? barColor : 'bg-line')} />
            ))}
          </div>
          <ul id="password-rules" className="mt-2 space-y-1">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(password)
              return (
                <li key={r.label} className={cn('flex items-center gap-2 text-sm', ok ? 'text-success' : 'text-muted')}>
                  {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />} {r.label}
                </li>
              )
            })}
          </ul>
        </div>
        <Field label="Confirm password" htmlFor="confirmPassword" error={confirm.length > 0 && !matches ? 'Passwords do not match' : undefined}>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <SubmitButton size="lg" className="w-full" pendingText="Sending code…" disabled={!meetsRules || !matches}>
          Create account
        </SubmitButton>
      </form>
      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
