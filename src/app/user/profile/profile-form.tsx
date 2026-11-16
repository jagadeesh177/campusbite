'use client'

import { useActionState } from 'react'
import { updateProfileAction } from '@/app/actions/user'
import { Checkbox, Field, Input, Select } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'
import type { ActionResult } from '@/lib/errors'

export function ProfileForm({
  defaults,
}: {
  defaults: { phone: string; dietaryPreference: string; orderUpdatesEnabled: boolean }
}) {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(updateProfileAction, undefined)
  const fe = state && !state.ok ? state.fieldErrors : undefined
  return (
    <form action={action} className="space-y-5">
      {state?.ok && <Notice tone="success">{state.message}</Notice>}
      {state && !state.ok && !fe && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Phone (optional)" htmlFor="phone" hint="Only used by the canteen if there’s a problem with your order." error={fe?.phone}>
        <Input id="phone" name="phone" type="tel" defaultValue={defaults.phone} placeholder="+91 98xxxxxxxx" autoComplete="tel" />
      </Field>
      <Field label="Dietary preference" htmlFor="dietaryPreference">
        <Select id="dietaryPreference" name="dietaryPreference" defaultValue={defaults.dietaryPreference}>
          <option value="NO_PREFERENCE">No preference</option>
          <option value="VEG">Vegetarian</option>
          <option value="NON_VEG">Non-vegetarian</option>
        </Select>
      </Field>
      <Checkbox name="orderUpdatesEnabled" defaultChecked={defaults.orderUpdatesEnabled} label="Show order update notifications on my dashboard" />
      <SubmitButton pendingText="Saving…">Save preferences</SubmitButton>
    </form>
  )
}
