'use client'

import { useActionState, useState } from 'react'
import { Check, Eye, EyeOff, X } from 'lucide-react'
import { setPasswordWithLinkAction, type FormState } from '@/app/actions/auth'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'
import { cn } from '@/lib/cn'

// Mirrors the server rule in src/lib/auth/password.ts (the server re-validates)
export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'At least one letter', test: (p: string) => /[A-Za-z]/.test(p) },
  { label: 'At least one number', test: (p: string) => /\d/.test(p) },
]

function strength(p: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!p) return { score: 0, label: '' }
  let s = PASSWORD_RULES.filter((r) => r.test(p)).length
  if (p.length >= 12 && /[^A-Za-z0-9]/.test(p)) s++
  const score = Math.min(4, s) as 0 | 1 | 2 | 3 | 4
  return { score, label: ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'][score] }
}

export function SetPasswordForm({
  token,
  type,
  purpose,
  session,
}: {
  token: string
  type: string
  purpose: 'ACTIVATION' | 'PASSWORD_RESET'
  /** Set when Supabase's default email link already verified the email and sent tokens in the URL fragment */
  session?: { accessToken: string; refreshToken: string }
}) {
  const [state, action] = useActionState<FormState, FormData>(setPasswordWithLinkAction, undefined)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)

  const meetsRules = PASSWORD_RULES.every((r) => r.test(password))
  const matches = confirm.length > 0 && confirm === password
  const s = strength(password)
  const barColor = ['bg-line', 'bg-danger', 'bg-warning', 'bg-accent', 'bg-success'][s.score]

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.error && (
        <Notice tone="danger">
          {state.error}{' '}
          <a href={purpose === 'ACTIVATION' ? '/activate' : '/forgot-password'} className="font-semibold underline">
            Request a new link
          </a>
        </Notice>
      )}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="type" value={type} />
      {session && (
        <>
          <input type="hidden" name="accessToken" value={session.accessToken} />
          <input type="hidden" name="refreshToken" value={session.refreshToken} />
        </>
      )}

      <Field label="New password" htmlFor="password">
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
        <p className="mt-1 text-xs text-subtle">Tip: a short phrase with a number and symbol (12+ characters) is strongest.</p>
      </div>

      <Field
        label="Confirm password"
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

      <SubmitButton size="lg" className="w-full" pendingText="Activating…" disabled={!meetsRules || !matches}>
        {purpose === 'ACTIVATION' ? 'Activate My Account' : 'Save new password'}
      </SubmitButton>
    </form>
  )
}
