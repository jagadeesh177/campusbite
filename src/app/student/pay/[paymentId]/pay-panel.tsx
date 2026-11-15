'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CheckCircle2, FlaskConical, Loader2, Lock, XCircle } from 'lucide-react'
import { simulatePaymentAction } from '@/app/actions/student'
import { payWithRazorpay } from '@/components/student/razorpay'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/misc'
import { formatINR } from '@/lib/money'
import type { CheckoutSession } from '@/lib/orders/create-order'

export function SimulatorPanel({ paymentId, orderId, amountPaise }: { paymentId: string; orderId: string; amountPaise: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'success' | 'failure'>(null)
  const [message, setMessage] = useState<{ tone: 'danger' | 'warning'; text: string } | null>(null)

  async function run(outcome: 'success' | 'failure') {
    setBusy(outcome)
    setMessage(null)
    const r = await simulatePaymentAction(paymentId, outcome)
    setBusy(null)
    if (!r.ok) return setMessage({ tone: 'danger', text: r.error })
    if (r.data.outcome === 'failed') {
      return setMessage({ tone: 'warning', text: 'Simulated payment failed. Your order is still waiting — you can try again.' })
    }
    router.push(`/student/orders/${orderId}?paid=1`)
  }

  return (
    <div>
      <div className="rounded-2xl border-2 border-dashed border-warning/70 bg-warning-soft p-5">
        <div className="flex items-center gap-2 font-display text-lg font-bold text-warning-ink">
          <FlaskConical className="h-5 w-5" /> Development payment simulator
        </div>
        <p className="mt-1 text-sm text-warning-ink">
          This is <strong>not a real payment</strong> and no money moves. It sends a signed test callback through the
          same server-side verification a real UPI payment uses. Disable it in production.
        </p>
      </div>
      {message && <Notice tone={message.tone} className="mt-4">{message.text}</Notice>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Button size="xl" onClick={() => run('success')} disabled={!!busy}>
          {busy === 'success' ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5 text-accent" />}
          Simulate success · {formatINR(amountPaise)}
        </Button>
        <Button size="xl" variant="secondary" onClick={() => run('failure')} disabled={!!busy}>
          {busy === 'failure' ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5 text-danger" />}
          Simulate failure
        </Button>
      </div>
    </div>
  )
}

export function RazorpayRetry({ session, student }: { session: CheckoutSession; student: { name: string; email: string } }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div>
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <Button
        size="xl"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const outcome = await payWithRazorpay(session, student)
            if (outcome !== 'dismissed') router.push(`/student/orders/${session.orderId}?paid=1`)
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Payment failed')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-4.5 w-4.5" />}
        Pay {formatINR(session.amountPaise)} with UPI
      </Button>
    </div>
  )
}
