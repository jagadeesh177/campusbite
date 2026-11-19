'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { passwordLoginAction, type FormState } from '@/app/actions/auth'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'

/** Email + password sign-in for the Staff and Kitchen portals (accounts are created by an administrator). */
export function PasswordLoginForm({ portal }: { portal: 'STAFF' | 'CANTEEN' }) {
  const [state, action] = useActionState<FormState, FormData>(passwordLoginAction, undefined)
  const [show, setShow] = useState(false)
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <input type="hidden" name="portal" value={portal} />
      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={state?.email} />
      </Field>
      <Field label="Password" htmlFor="password">
        <div className="relative">
          <Input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required className="pr-12" />
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
      <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="remember" defaultChecked className="h-4 w-4 rounded border-line accent-primary" /> Remember me
      </label>
      <SubmitButton size="lg" className="w-full" pendingText="Signing in…">
        Sign In
      </SubmitButton>
      <p className="text-center text-sm text-muted">Forgot your password? Ask your administrator to reset it.</p>
    </form>
  )
}
