'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { loginAction, type FormState } from '@/app/actions/auth'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'

/** Google's "G" mark, as required on a "Continue with Google" button. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export function LoginForm({ notice }: { notice?: { tone: 'danger' | 'success' | 'info'; text: string } }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, undefined)
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-5">
      {notice && !state?.error && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {/* Full page navigation: the server starts the Google sign-in (PKCE) */}
      <a
        href="/auth/google"
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface px-4 font-semibold text-ink shadow-sm transition hover:border-primary/40 hover:bg-primary-soft/40"
      >
        <GoogleMark /> Continue with Google
      </a>

      <div className="flex items-center gap-3 text-xs font-semibold tracking-wide text-subtle uppercase" role="separator">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>

      <form action={action} className="space-y-4" noValidate>
        {state?.error && <Notice tone="danger">{state.error}</Notice>}
        <Field label="Email address" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            defaultValue={state?.email}
            placeholder="you@example.com"
          />
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
        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="remember" defaultChecked className="h-4 w-4 rounded border-line accent-primary" /> Remember me
          </label>
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
            Forgot Password?
          </Link>
        </div>
        <SubmitButton size="lg" className="w-full" pendingText="Signing in…">
          Sign In
        </SubmitButton>
      </form>
    </div>
  )
}
