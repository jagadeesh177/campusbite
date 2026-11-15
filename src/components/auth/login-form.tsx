'use client'

import { useActionState } from 'react'
import type { Role } from '@prisma/client'
import { loginAction, type FormState } from '@/app/actions/auth'
import { Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'

export function LoginForm({ portal, emailPlaceholder }: { portal: Role; emailPlaceholder: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction.bind(null, portal), undefined)
  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          defaultValue={state?.email}
          placeholder={emailPlaceholder}
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton size="lg" className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  )
}
