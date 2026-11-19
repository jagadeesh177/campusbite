'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, CheckCircle2, Eye, EyeOff, X } from 'lucide-react'
import { changeRecoveryPasswordAction, endRecoveryAction, type RecoveryFormState } from '@/app/actions/auth'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'
import { cn } from '@/lib/cn'
import { PASSWORD_RULES, strength } from './set-password-form'

/** New + confirm password, show/hide; can be used repeatedly until the recovery window ends. */
export function RecoveryPasswordForm({ expiresAt, email }: { expiresAt: string; email: string }) {
  const [state, action] = useActionState<RecoveryFormState, FormData>(changeRecoveryPasswordAction, undefined)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()))

  // Hard expiry: when the window ends the server refuses; reload to show the expired screen
  useEffect(() => {
    const t = setInterval(() => {
      const ms = Math.max(0, new Date(expiresAt).getTime() - Date.now())
      setLeft(ms)
      if (ms === 0) window.location.reload()
    }, 1000)
    return () => clearInterval(t)
  }, [expiresAt])

  // Clear the fields after each successful change
  useEffect(() => {
    if (state?.changed) {
      setPassword('')
      setConfirm('')
    }
  }, [state?.changed])

  const meetsRules = PASSWORD_RULES.every((r) => r.test(password))
  const matches = confirm.length > 0 && confirm === password
  const s = strength(password)
  const barColor = ['bg-line', 'bg-danger', 'bg-warning', 'bg-accent', 'bg-success'][s.score]
  const mm = String(Math.floor(left / 60000)).padStart(2, '0')
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Account: <strong className="text-ink">{email}</strong> · time left{' '}
        <span className="font-mono font-semibold text-ink">
          {mm}:{ss}
        </span>
      </p>
      {state?.changed ? (
        <Notice tone="success" title="Password changed">
          You can sign in with your new password now. Signed-in devices were signed out. You can change it again until this
          page expires.
        </Notice>
      ) : null}
      <form action={action} className="space-y-5" noValidate>
        {state?.error && <Notice tone="danger">{state.error}</Notice>}
        <Field label="New Password" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
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
              <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= s.score ? barColor : 'bg-line')} />
            ))}
          </div>
          {s.label && <div className="mt-1.5 text-xs font-medium text-subtle">Strength: {s.label}</div>}
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
        <Field
          label="Confirm New Password"
          htmlFor="confirmPassword"
          error={confirm.length > 0 && !matches ? 'Passwords do not match' : undefined}
        >
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={confirm.length > 0 && !matches}
          />
        </Field>
        <SubmitButton size="lg" className="w-full" pendingText="Changing…" disabled={!meetsRules || !matches}>
          Change Password
        </SubmitButton>
      </form>
      <form action={endRecoveryAction}>
        <SubmitButton variant="secondary" size="lg" className="w-full" pendingText="Finishing…">
          <CheckCircle2 className="h-4.5 w-4.5" /> Done, go to sign in
        </SubmitButton>
      </form>
    </div>
  )
}
