'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useState } from 'react'
import { KeyRound, Loader2, Pencil, UserPlus } from 'lucide-react'
import { createAccountAction, resetPasswordAction, setAccountStatusAction, updatePermissionsAction } from '@/app/actions/staff'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Field, Input } from '@/components/ui/form'
import { Notice } from '@/components/ui/misc'
import { ConfirmDialog, Flash, SubmitButton, useFlash } from '@/components/ui/client'
import type { ActionResult } from '@/lib/errors'

export interface AccountRow {
  id: string
  name: string
  email: string
  label: string | null
  status: string
  permissions: string[]
  lastLogin: string | null
  isSelf: boolean
}

function TempPassword({ email, password, loginPath, onDone }: { email: string; password: string; loginPath: string; onDone: () => void }) {
  return (
    <Notice tone="success" title="Share these sign-in details securely (shown once)">
      <div className="mt-2 grid gap-1 font-mono text-sm">
        <span>Login page: {loginPath}</span>
        <span>Email: {email}</span>
        <span>Temporary password: <strong>{password}</strong></span>
      </div>
      <p className="mt-2">They must choose a new password the first time they sign in.</p>
      <button onClick={onDone} className="mt-2 font-semibold underline">I&apos;ve shared it — hide</button>
    </Notice>
  )
}

export function AccountsManager({
  kind,
  accounts,
  catalogue,
  labelName,
}: {
  kind: 'CANTEEN' | 'STAFF'
  accounts: AccountRow[]
  catalogue: Record<string, string>
  labelName: string
}) {
  const router = useRouter()
  const [createState, createAction] = useActionState<ActionResult<{ tempPassword: string; email: string }> | undefined, FormData>(createAccountAction, undefined)
  const [showCreate, setShowCreate] = useState(false)
  const [hideCreated, setHideCreated] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [reset, setReset] = useState<{ email: string; password: string } | null>(null)
  const [flash, setFlash] = useFlash()

  const created = createState?.ok && !hideCreated ? createState.data : null
  // Only shown after a client action, so window is available
  const loginPath = `${typeof window === 'undefined' ? '' : window.location.origin}${kind === 'CANTEEN' ? '/login/canteen' : '/login/staff'}`

  async function savePermissions(id: string) {
    setBusy(true)
    const r = await updatePermissionsAction(id, draft)
    setBusy(false)
    setFlash(r.ok ? { tone: 'success', text: r.message ?? 'Saved' } : { tone: 'danger', text: r.error })
    if (r.ok) setEditing(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {created && <TempPassword email={created.email} password={created.tempPassword} loginPath={loginPath} onDone={() => setHideCreated(true)} />}
      {reset && <TempPassword email={reset.email} password={reset.password} loginPath={loginPath} onDone={() => setReset(null)} />}

      <Card>
        <CardHeader
          title={kind === 'CANTEEN' ? 'Canteen operators' : 'Staff accounts'}
          description="Only authorised administrators can add accounts here. They sign in at the Staff / Kitchen Login with the email and a temporary password."
          action={
            <Button onClick={() => { setShowCreate((s) => !s); setHideCreated(false) }}>
              <UserPlus className="h-4.5 w-4.5" /> New account
            </Button>
          }
        />
        <CardBody>
          {showCreate && (
            <form
              action={(fd) => { setHideCreated(false); createAction(fd) }}
              className="mb-6 space-y-4 rounded-2xl border border-line bg-bg p-5"
            >
              <input type="hidden" name="kind" value={kind} />
              {createState && !createState.ok && <Notice tone="danger">{createState.error}</Notice>}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Full name" htmlFor="name"><Input id="name" name="name" required maxLength={80} /></Field>
                <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" required placeholder="name@college.edu" /></Field>
                <Field label={labelName} htmlFor="label"><Input id="label" name="label" maxLength={60} /></Field>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Permissions</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(catalogue).map(([key, label]) => (
                    <Checkbox key={key} name="permissions" value={key} label={label} defaultChecked={kind === 'CANTEEN' && key === 'ORDERS'} />
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
                <SubmitButton pendingText="Creating…">Create account</SubmitButton>
              </div>
            </form>
          )}

          <ul className="divide-y divide-line">
            {accounts.map((a) => (
              <li key={a.id} className="py-4 first:pt-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.name}</span>
                      {a.isSelf && <Badge tone="primary">You</Badge>}
                      <Badge tone={a.status === 'ACTIVE' ? 'success' : 'danger'} dot>{a.status === 'ACTIVE' ? 'Active' : 'Deactivated'}</Badge>
                    </div>
                    <div className="text-sm text-muted">{a.email}{a.label ? ` · ${a.label}` : ''}</div>
                    <div className="text-xs text-subtle">Last sign-in: {a.lastLogin ?? 'never'}</div>
                  </div>
                  {!a.isSelf && (
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(a.id); setDraft(a.permissions) }}>
                        <Pencil className="h-4 w-4" /> Permissions
                      </Button>
                      <ConfirmDialog
                        trigger={<><KeyRound className="h-4 w-4" /> Reset password</>}
                        triggerVariant="ghost"
                        triggerSize="sm"
                        title={`Reset password for ${a.name}?`}
                        description="They’ll be signed out and must set a new password with the temporary one."
                        confirmLabel="Reset"
                        onConfirm={async () => {
                          const r = await resetPasswordAction(a.id)
                          if (r.ok) setReset({ email: a.email, password: r.data.tempPassword })
                          else setFlash({ tone: 'danger', text: r.error })
                        }}
                      />
                      <ConfirmDialog
                        trigger={a.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                        triggerVariant={a.status === 'ACTIVE' ? 'danger-ghost' : 'soft'}
                        triggerSize="sm"
                        title={a.status === 'ACTIVE' ? `Deactivate ${a.name}?` : `Reactivate ${a.name}?`}
                        description={a.status === 'ACTIVE' ? 'They will be signed out immediately.' : 'They will be able to sign in again.'}
                        confirmVariant={a.status === 'ACTIVE' ? 'danger' : 'primary'}
                        confirmLabel={a.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                        onConfirm={async () => {
                          const r = await setAccountStatusAction(a.id, a.status !== 'ACTIVE')
                          setFlash(r.ok ? { tone: 'success', text: r.message ?? 'Done' } : { tone: 'danger', text: r.error })
                          router.refresh()
                        }}
                      />
                    </div>
                  )}
                </div>
                {editing === a.id ? (
                  <div className="mt-3 rounded-xl border border-line bg-bg p-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Object.entries(catalogue).map(([key, label]) => (
                        <Checkbox
                          key={key}
                          label={label}
                          checked={draft.includes(key)}
                          onChange={(e) => setDraft((d) => (e.target.checked ? [...d, key] : d.filter((x) => x !== key)))}
                        />
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => savePermissions(a.id)} disabled={busy}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save permissions
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.permissions.length ? a.permissions.map((p) => <Badge key={p} tone="accent">{catalogue[p] ?? p}</Badge>) : <span className="text-sm text-subtle">No permissions</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Flash flash={flash} />
    </div>
  )
}
