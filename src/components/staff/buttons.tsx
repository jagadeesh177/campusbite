'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { checkRefundStatusAction, confirmRefundCreditAction, partialRefundAction, processRefundAction, setUserAccessAction } from '@/app/actions/staff'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Flash, useFlash } from '@/components/ui/client'

export function UserAccessButton({ userId, active, name }: { userId: string; active: boolean; name: string }) {
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
            ? 'They will be signed out and unable to order. Their order history is kept.'
            : 'They will be able to sign in and order again.'
        }
        confirmLabel={active ? 'Revoke access' : 'Restore access'}
        confirmVariant={active ? 'danger' : 'primary'}
        onConfirm={async () => {
          const r = await setUserAccessAction(userId, !active)
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

/** Asks Razorpay for the refund's status. Never sends a new refund. */
export function CheckRefundButton({ refundId }: { refundId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useFlash()
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const r = await checkRefundStatusAction(refundId)
          setBusy(false)
          setFlash(r.ok ? { tone: 'success', text: r.message ?? 'Checked' } : { tone: 'danger', text: r.error })
          router.refresh()
        }}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Check status
      </Button>
      <Flash flash={flash} />
    </>
  )
}

/** REFUNDED only with evidence of the customer's bank credit (recorded with your name and the time). */
export function ConfirmCreditButton({ refundId, amount }: { refundId: string; amount: string }) {
  const router = useRouter()
  const [flash, setFlash] = useFlash()
  return (
    <>
      <ConfirmDialog
        trigger="Confirm bank credit"
        triggerVariant="soft"
        triggerSize="sm"
        title={`Confirm the customer received ${amount}?`}
        description="Only do this with real evidence, such as the customer confirming the credit on their bank statement (with the UTR/ARN) or a bank/Razorpay support reply. Razorpay's “processed” status is not proof. Your name, the time and the evidence are recorded."
        requireReason
        reasonLabel="Evidence"
        reasonPlaceholder="e.g. Customer sent bank statement showing credit on 21 Nov, UTR 6322…"
        confirmLabel="Mark as refunded"
        onConfirm={async (evidence) => {
          const r = await confirmRefundCreditAction(refundId, evidence)
          setFlash(r.ok ? { tone: 'success', text: r.message ?? 'Done' } : { tone: 'danger', text: r.error })
          router.refresh()
        }}
      />
      <Flash flash={flash} />
    </>
  )
}

/** Partial refund of a successful payment (e.g. a missing item). One refund per payment. */
export function PartialRefundButton({ paymentId, maxRupees }: { paymentId: string; maxRupees: string }) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [flash, setFlash] = useFlash()
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <input
        aria-label="Refund amount in rupees"
        inputMode="decimal"
        placeholder={`₹ up to ${maxRupees}`}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="h-9 w-28 rounded-lg border border-line bg-surface px-2 text-sm"
      />
      <ConfirmDialog
        trigger="Refund"
        triggerVariant="secondary"
        triggerSize="sm"
        disabled={!amount.trim()}
        title={`Refund ₹${amount || '…'} to the customer?`}
        description="Sent to Razorpay at the fastest speed it supports. This payment can only be refunded once."
        requireReason
        reasonLabel="Reason"
        reasonPlaceholder="e.g. Item missing from the order"
        confirmLabel="Send refund"
        onConfirm={async (reason) => {
          const r = await partialRefundAction(paymentId, amount, reason)
          setFlash(r.ok ? { tone: 'success', text: r.message ?? 'Done' } : { tone: 'danger', text: r.error })
          if (r.ok) setAmount('')
          router.refresh()
        }}
      />
      <Flash flash={flash} />
    </span>
  )
}
