'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff, KeyRound, X } from 'lucide-react'
import { changePasswordInlineAction, type ChangePasswordState } from '@/app/actions/user'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'
import { Button } from '@/components/ui/button'
import { PASSWORD_RULES } from '@/components/auth/set-password-form'
import { cn } from '@/lib/cn'

/** Profile → Account Security: hidden until "Change Password" is clicked. */
export function AccountSecurity() {
  const [open, setOpen] = useState(false)
  const [state, action] = useActionState<ChangePasswordState, FormData>(changePasswordInlineAction, undefined)
  const [show, setShow] = useState(false)
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const fe = state?.fieldErrors

  // After a successful change: clear every field and fold the form away
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset()
      setNext('')
      setConfirm('')
      setShow(false)
      setOpen(false)
    }
  }, [state?.ok, state?.nonce])

  const close = () => {
    formRef.current?.reset()
    setNext('')
    setConfirm('')
    setShow(false)
    setOpen(false)
  }

  const type = show ? 'text' : 'password'
  const meetsRules = PASSWORD_RULES.every((r) => r.test(next))
  const matches = confirm.length > 0 && confirm === next

  if (!open) {
    return (
      <div>
        {state?.ok && <Notice tone="success" className="mb-4">{state.message}</Notice>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 text-[15px]">
            <KeyRound className="h-4.5 w-4.5 text-muted" aria-hidden />
            <span className="text-muted">Password</span>
            <span className="font-medium tracking-widest text-ink" aria-hidden>••••••••</span>
          </span>
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Change Password</Button>
        </div>
      </div>
    )
  }

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      {state?.error && !state.ok && <Notice tone="danger">{state.error}</Notice>}

      <Field label="Current password" htmlFor="currentPassword" error={fe?.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type={type} autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="newPassword" error={fe?.newPassword}>
        <Input
          id="newPassword"
          name="newPassword"
          type={type}
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>
      {next.length > 0 && (
        <ul className="grid gap-1 text-sm" aria-label="Password rules">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(next)
            return (
              <li key={r.label} className={cn('inline-flex items-center gap-1.5', ok ? 'text-success' : 'text-muted')}>
                {ok ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />} {r.label}
              </li>
            )
          })}
        </ul>
      )}
      <Field label="Confirm new password" htmlFor="confirmPassword" error={fe?.confirmPassword ?? (confirm && !matches ? 'Passwords do not match' : undefined)}>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type={type}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>

      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        aria-pressed={show}
      >
        {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        {show ? 'Hide passwords' : 'Show passwords'}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingText="Saving…" disabled={!meetsRules || !matches}>
            Save New Password
          </SubmitButton>
          <Button variant="secondary" onClick={close}>Cancel</Button>
        </div>
        <Link href="/forgot-password" className="text-sm font-semibold text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
    </form>
  )
}
