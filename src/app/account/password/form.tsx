'use client'

import { useActionState } from 'react'
import { changePasswordAction, type FormState } from '@/app/actions/auth'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'

export function ChangePasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, undefined)
  const fe = state?.fieldErrors
  return (
    <form action={action} className="space-y-5">
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Current password" htmlFor="currentPassword" error={fe?.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="newPassword" hint="At least 8 characters with a letter and a number." error={fe?.newPassword}>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={fe?.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Saving…">
        Save password
      </SubmitButton>
    </form>
  )
}
