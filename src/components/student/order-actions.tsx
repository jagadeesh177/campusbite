'use client'

import { useRouter } from 'next/navigation'
import { cancelOrderAction } from '@/app/actions/student'
import { ConfirmDialog, Flash, useFlash } from '@/components/ui/client'

export function CancelOrderButton({ orderId, paid }: { orderId: string; paid: boolean }) {
  const router = useRouter()
  const [flash, setFlash] = useFlash()
  return (
    <>
      <ConfirmDialog
        trigger="Cancel order"
        triggerVariant="danger-ghost"
        title="Cancel this order?"
        description={
          paid
            ? 'The canteen hasn’t started on it yet, so you’ll get a full refund to your original payment method.'
            : 'Your unpaid order will be cancelled.'
        }
        confirmLabel="Yes, cancel"
        confirmVariant="danger"
        onConfirm={async () => {
          const r = await cancelOrderAction(orderId)
          setFlash(r.ok ? { tone: 'success', text: r.message ?? 'Cancelled' } : { tone: 'danger', text: r.error })
          router.refresh()
        }}
      />
      <Flash flash={flash} />
    </>
  )
}
