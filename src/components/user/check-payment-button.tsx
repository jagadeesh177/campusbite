'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { checkPaymentStatusAction } from '@/app/actions/user'

/** Asks the server to look the payment up with Razorpay (for a lost callback). */
export function CheckPaymentButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setMsg(null)
          const r = await checkPaymentStatusAction(orderId)
          setBusy(false)
          setMsg(r.ok ? (r.message ?? null) : r.error)
          router.refresh()
        }}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check payment status
      </button>
      {msg && <span role="status" className="text-xs text-muted">{msg}</span>}
    </span>
  )
}
