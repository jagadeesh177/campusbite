'use client'

import { useActionState, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { deleteAccountAction, type DeleteAccountState } from '@/app/actions/user'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'

const WORD = 'DELETE'

export function DeleteAccount() {
  const [state, action] = useActionState<DeleteAccountState, FormData>(deleteAccountAction, undefined)
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')
  const ready = confirm.trim() === WORD && password.length > 0

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-danger-ink">Delete account</div>
          <p className="text-sm text-muted">Permanently remove your account and personal details.</p>
        </div>
        <Button variant="danger-ghost" size="sm" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" /> Delete account
        </Button>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="flex gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger-ink" role="alert">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">This permanently deletes your account. It cannot be undone.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Your name, email, mobile number, preferences and login are erased.</li>
            <li>You&apos;ll be signed out everywhere and can&apos;t sign in again with this account.</li>
            <li>Unpaid orders are cancelled. Past orders stay only as anonymous records for the canteen&apos;s accounts.</li>
            <li>If an order is being prepared or a refund is pending, wait until it&apos;s finished.</li>
          </ul>
        </div>
      </div>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Your password" htmlFor="delete-password">
        <Input
          id="delete-password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      <Field label={<>Type <strong>{WORD}</strong> to confirm</>} htmlFor="delete-confirm">
        <Input
          id="delete-confirm"
          name="confirm"
          autoComplete="off"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={WORD}
          required
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="danger" pendingText="Deleting…" disabled={!ready}>
          <Trash2 className="h-4 w-4" /> Permanently delete my account
        </SubmitButton>
        <Button variant="secondary" onClick={() => { setOpen(false); setConfirm(''); setPassword('') }}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
