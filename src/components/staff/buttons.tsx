'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { processRefundAction, setStudentAccessAction } from '@/app/actions/staff'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Flash, useFlash } from '@/components/ui/client'

export function StudentAccessButton({ userId, active, name }: { userId: string; active: boolean; name: string }) {
  const router = useRouter()
  const [flash, setFlash] = useFlash()
  return (
    <>
      <ConfirmDialog
        trigger={active ? 'Revoke access' : 'Restore access'}
        triggerVariant={active ? 'danger-ghost' : 'soft'}
        triggerSize="sm"
        title={active ? `Revoke CampusBite access for ${name}?` : `Restore access for ${name}?`}
        description={
          active
            ? 'They will be signed out and unable to order. This does not change their college enrollment.'
            : 'They will be able to sign in and order again (if still enrolled).'
        }
        confirmLabel={active ? 'Revoke access' : 'Restore access'}
        confirmVariant={active ? 'danger' : 'primary'}
        onConfirm={async () => {
          const r = await setStudentAccessAction(userId, !active)
          setFlash(r.ok ? { tone: 'success', text: r.message ?? 'Done' } : { tone: 'danger', text: r.error })
          router.refresh()
        }}
      />
      <Flash flash={flash} />
    </>
  )
}

export function ProcessRefundButton({ refundId, label = 'Process refund' }: { refundId: string; label?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useFlash()
  return (
    <>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const r = await processRefundAction(refundId)
          setBusy(false)
          setFlash(r.ok ? { tone: 'success', text: r.message ?? 'Done' } : { tone: 'danger', text: r.error })
          router.refresh()
        }}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {label}
      </Button>
      <Flash flash={flash} />
    </>
  )
}
