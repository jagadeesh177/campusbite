'use client'

import { useActionState, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { inviteUserAction } from '@/app/actions/staff'
import type { ActionResult } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'

/** The only way a customer account is created: by staff. The user gets an email to set a password (or signs in with Google). */
export function AddUserForm() {
  const [open, setOpen] = useState(false)
  const [state, action] = useActionState<ActionResult<{ email: string }> | undefined, FormData>(inviteUserAction, undefined)
  return (
    <div className="mb-6">
      {!open ? (
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="h-4.5 w-4.5" /> Add user
        </Button>
      ) : (
        <form action={action} className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h2 className="font-semibold">Add a user</h2>
          {state?.ok && (
            <Notice tone="success">
              Account created for <strong>{state.data.email}</strong>. We emailed them a link to set their password. They can also
              sign in with Google using this email.
            </Notice>
          )}
          {state && !state.ok && <Notice tone="danger">{state.error}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="fullName"><Input id="fullName" name="fullName" required maxLength={80} /></Field>
            <Field label="Email" htmlFor="newEmail"><Input id="newEmail" name="email" type="email" required placeholder="name@example.com" /></Field>
            <Field label="Mobile (optional)" htmlFor="phone"><Input id="phone" name="phone" type="tel" inputMode="numeric" maxLength={14} placeholder="10-digit mobile" /></Field>
            <Field label="Department (optional)" htmlFor="department"><Input id="department" name="department" maxLength={80} /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            <SubmitButton pendingText="Creating…">Create user &amp; send email</SubmitButton>
          </div>
        </form>
      )}
    </div>
  )
}
