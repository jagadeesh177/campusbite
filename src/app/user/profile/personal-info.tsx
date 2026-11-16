'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { BadgeCheck, Pencil } from 'lucide-react'
import { updateProfileAction } from '@/app/actions/user'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { SubmitButton } from '@/components/ui/client'
import type { ActionResult } from '@/lib/errors'

const DIET: Record<string, string> = { NO_PREFERENCE: 'No preference', VEG: 'Vegetarian', NON_VEG: 'Non-vegetarian' }

export interface PersonalDetails {
  fullName: string
  email: string
  department: string
  phone: string
  dietaryPreference: string
}

/** View your details at a glance; Edit Profile switches the same section into a form. */
export function PersonalInfo({ details }: { details: PersonalDetails }) {
  const [editing, setEditing] = useState(false)
  const [state, action] = useActionState<ActionResult | undefined, FormData>(updateProfileAction, undefined)
  const [saved, setSaved] = useState(false)
  const handled = useRef<ActionResult | undefined>(undefined)
  const fe = state && !state.ok ? state.fieldErrors : undefined

  // After a successful save, go back to the read-only view
  useEffect(() => {
    if (state && state !== handled.current) {
      handled.current = state
      if (state.ok) {
        setEditing(false)
        setSaved(true)
      }
    }
  }, [state])

  const rows: [string, React.ReactNode][] = [
    ['Full name', details.fullName],
    [
      'Email',
      <span key="e" className="inline-flex flex-wrap items-center justify-end gap-2">
        <span className="break-all">{details.email}</span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-success"><BadgeCheck className="h-4 w-4" aria-hidden /> Verified</span>
      </span>,
    ],
    ['Department', details.department || '—'],
    ['Phone', details.phone || '—'],
    ['Dietary preference', DIET[details.dietaryPreference] ?? DIET.NO_PREFERENCE],
  ]

  return (
    <section aria-labelledby="personal-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="personal-title" className="text-lg font-semibold text-ink">Personal Information</h2>
        {!editing && (
          <Button variant="secondary" size="sm" onClick={() => { setSaved(false); setEditing(true) }}>
            <Pencil className="h-4 w-4" /> Edit Profile
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
        {!editing ? (
          <>
            {saved && <Notice tone="success" className="mb-4">Profile saved.</Notice>}
            <dl className="divide-y divide-line">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 py-3 text-[15px] first:pt-0 last:pb-0">
                  <dt className="shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0 text-right font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <form action={action} className="space-y-4" noValidate>
            {state && !state.ok && !fe && <Notice tone="danger">{state.error}</Notice>}
            <Field label="Full name" htmlFor="fullName" error={fe?.fullName}>
              <Input id="fullName" name="fullName" defaultValue={details.fullName} autoComplete="name" required maxLength={80} />
            </Field>
            <Field label="Email" htmlFor="email" hint="Your email can’t be changed.">
              <Input id="email" value={details.email} readOnly disabled className="bg-bg text-muted" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department" htmlFor="department" error={fe?.department}>
                <Input id="department" name="department" defaultValue={details.department} maxLength={80} placeholder="Optional" />
              </Field>
              <Field label="Phone" htmlFor="phone" error={fe?.phone}>
                <Input id="phone" name="phone" type="tel" defaultValue={details.phone} autoComplete="tel" placeholder="Optional" />
              </Field>
            </div>
            <Field label="Dietary preference" htmlFor="dietaryPreference">
              <Select id="dietaryPreference" name="dietaryPreference" defaultValue={details.dietaryPreference}>
                <option value="NO_PREFERENCE">No preference</option>
                <option value="VEG">Vegetarian</option>
                <option value="NON_VEG">Non-vegetarian</option>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2 pt-1">
              <SubmitButton pendingText="Saving…">Save Changes</SubmitButton>
              {/* Cancel unmounts the form, discarding anything typed */}
              <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
