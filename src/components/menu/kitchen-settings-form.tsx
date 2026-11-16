'use client'

import { useActionState } from 'react'
import { updateKitchenSettingsAction } from '@/app/actions/canteen'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Checkbox, Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'
import type { ActionResult } from '@/lib/errors'

export interface KitchenSettingsValues {
  acceptingOrders: boolean
  pauseMessage: string
  defaultPrepMinutes: number
  maxConcurrentOrders: number
  pickupSlotMinutes: number
  openingTime: string
  closingTime: string
  convenienceFee: string
}

export function KitchenSettingsForm({ values }: { values: KitchenSettingsValues }) {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(updateKitchenSettingsAction, undefined)
  const fe = state && !state.ok ? state.fieldErrors : undefined
  return (
    <form action={action} className="space-y-6">
      {state?.ok && <Notice tone="success">{state.message}</Notice>}
      {state && !state.ok && <Notice tone="danger">{state.error}</Notice>}

      <Card>
        <CardHeader title="Online ordering" description="Pause ordering instantly when the kitchen is overwhelmed or closed." />
        <CardBody className="space-y-4">
          <div className="rounded-xl border border-line bg-bg p-4">
            <Checkbox name="acceptingOrders" defaultChecked={values.acceptingOrders} label={<span className="font-semibold">Accept new online orders</span>} />
          </div>
          <Field label="Message shown when paused (optional)" htmlFor="pauseMessage" error={fe?.pauseMessage}>
            <Input id="pauseMessage" name="pauseMessage" defaultValue={values.pauseMessage} maxLength={140} placeholder="Back at 1:30 PM after the lunch rush" />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Operating hours" description="Users can only order inside these hours (campus time)." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Opens" htmlFor="openingTime" error={fe?.openingTime} hint="Same-day hours, e.g. 08:00">
            <Input id="openingTime" name="openingTime" type="time" defaultValue={values.openingTime} required />
          </Field>
          <Field label="Closes" htmlFor="closingTime" error={fe?.closingTime} hint="Must be later than opening, e.g. 20:00 (not past midnight)">
            <Input id="closingTime" name="closingTime" type="time" defaultValue={values.closingTime} required />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Kitchen capacity & pickup" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Estimated prep time (minutes)" htmlFor="defaultPrepMinutes" hint="Minimum time shown to users." error={fe?.defaultPrepMinutes}>
            <Input id="defaultPrepMinutes" name="defaultPrepMinutes" type="number" min={1} max={120} defaultValue={values.defaultPrepMinutes} required />
          </Field>
          <Field label="Max orders in the kitchen at once" htmlFor="maxConcurrentOrders" hint="New orders are refused above this." error={fe?.maxConcurrentOrders}>
            <Input id="maxConcurrentOrders" name="maxConcurrentOrders" type="number" min={1} max={500} defaultValue={values.maxConcurrentOrders} required />
          </Field>
          <Field label="Pickup slot length (minutes)" htmlFor="pickupSlotMinutes" error={fe?.pickupSlotMinutes}>
            <Input id="pickupSlotMinutes" name="pickupSlotMinutes" type="number" min={5} max={120} step={5} defaultValue={values.pickupSlotMinutes} required />
          </Field>
          <Field label="Convenience fee per order (₹)" htmlFor="convenienceFee" error={fe?.convenienceFee} hint="Numbers only, e.g. 0, 2 or 2.50">
            <Input id="convenienceFee" name="convenienceFee" inputMode="decimal" defaultValue={values.convenienceFee} required />
          </Field>
        </CardBody>
      </Card>

      {/* Result shown right next to the button, so it's never off-screen */}
      <div className="sticky bottom-20 z-10 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-lift sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
        <div className="min-w-0 text-sm" role="status" aria-live="polite">
          {state?.ok && <span className="font-semibold text-success">✓ {state.message}</span>}
          {state && !state.ok && <span className="font-semibold text-danger-ink">{state.error}</span>}
          {!state && <span className="text-muted">Changes apply to users immediately after saving.</span>}
        </div>
        <SubmitButton size="lg" pendingText="Saving…">Save settings</SubmitButton>
      </div>
    </form>
  )
}
