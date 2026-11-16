'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Clock, FlaskConical, Loader2, Lock, ShieldCheck, ShoppingCart, Smartphone } from 'lucide-react'
import { placeOrderAction } from '@/app/actions/user'
import { useCart } from '@/components/portal/cart-context'
import { useServerQuote } from '@/components/user/use-quote'
import { payWithRazorpay } from '@/components/user/razorpay'
import { Card, CardBody } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { EmptyState, Notice } from '@/components/ui/misc'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/cn'

export function CheckoutView({
  tz,
  provider,
  user,
}: {
  tz: string
  provider: 'razorpay' | 'simulator'
  user: { name: string; email: string }
}) {
  const cart = useCart()
  const router = useRouter()
  const { quote, error: quoteError, loading } = useServerQuote()
  const [slot, setSlot] = useState<string>('asap')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true })

  if (cart.lines.length === 0 && !busy) {
    return (
      <Card>
        <EmptyState icon={ShoppingCart} title="Nothing to check out" action={<ButtonLink href="/user/menu">Browse menu</ButtonLink>} />
      </Card>
    )
  }

  const blocked = !quote || quote.hasUnavailable || !quote.kitchen.open || quote.total === 0

  async function pay() {
    setError(null)
    setBusy(true)
    const result = await placeOrderAction({
      items: cart.lines.map((l) => ({ foodItemId: l.foodItemId, quantity: l.quantity })),
      idempotencyKey: cart.checkoutKey,
      pickupSlot: slot === 'asap' ? null : slot,
    })
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    const session = result.data
    cart.clear() // order now exists server-side; payment can be retried from the order page

    if (session.provider === 'SIMULATOR') {
      router.push(`/user/pay/${session.paymentId}`)
      return
    }
    try {
      const outcome = await payWithRazorpay(session, user)
      router.push(`/user/orders/${session.orderId}${outcome === 'dismissed' ? '?payment=cancelled' : ''}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
      router.push(`/user/orders/${session.orderId}?payment=failed`)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <div className="space-y-6">
        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 font-semibold"><Clock className="h-5 w-5 text-accent" /> Pickup time</h2>
            <p className="mt-1 text-sm text-muted">We’ll have it ready at the counter.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <SlotOption checked={slot === 'asap'} onSelect={() => setSlot('asap')}>
                <span className="font-semibold">As soon as possible</span>
                <span className="text-xs text-muted">~{quote?.estimatedPrepMinutes ?? '—'} min</span>
              </SlotOption>
              {quote?.pickupSlots.slice(0, 8).map((s) => (
                <SlotOption key={s} checked={slot === s} onSelect={() => setSlot(s)}>
                  <span className="font-semibold">{timeFmt.format(new Date(s))}</span>
                  <span className="text-xs text-muted">Pickup slot</span>
                </SlotOption>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 font-semibold"><Smartphone className="h-5 w-5 text-accent" /> Payment method</h2>
            {provider === 'razorpay' ? (
              <div className="mt-4 flex items-center gap-4 rounded-xl border-2 border-primary bg-primary-soft/50 p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
                  <Smartphone className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-semibold">UPI</div>
                  <div className="text-sm text-muted">Google Pay, PhonePe, Paytm, BHIM and more — secured by Razorpay</div>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <Notice tone="warning" title="Development payment simulator">
                  No payment gateway is configured, so you&apos;ll use a simulator. <strong>No real money moves.</strong>{' '}
                  Configure Razorpay keys to accept real UPI payments.
                </Notice>
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-warning/60 p-4 text-sm">
                  <FlaskConical className="h-5 w-5 text-warning-ink" /> Simulated UPI (test only)
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-6">
        <CardBody>
          <h2 className="font-semibold">Order summary</h2>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            {(quote?.lines ?? []).map((l) => (
              <li key={l.foodItemId} className="flex justify-between gap-3">
                <span className={cn(!l.available && 'text-danger-ink line-through')}>
                  {l.name} <span className="text-muted">× {l.quantity}</span>
                </span>
                <span className="tabular-nums">{formatINR(l.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[15px]">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{quote ? formatINR(quote.subtotal) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Convenience fee</dt><dd className="tabular-nums">{quote ? (quote.fees ? formatINR(quote.fees) : 'Free') : '—'}</dd></div>
            <div className="flex justify-between pt-2 text-lg font-bold"><dt>To pay</dt><dd className="tabular-nums text-primary">{quote ? formatINR(quote.total) : '—'}</dd></div>
          </dl>

          {(quoteError || error) && <Notice tone="danger" className="mt-4">{error ?? quoteError}</Notice>}
          {quote?.hasUnavailable && (
            <Notice tone="warning" className="mt-4">
              Some items sold out. <Link href="/user/cart" className="font-semibold underline">Update your cart</Link>.
            </Notice>
          )}
          {quote && !quote.kitchen.open && <Notice tone="warning" className="mt-4">{quote.kitchen.message}</Notice>}

          <Button size="xl" className="mt-5 w-full" onClick={pay} disabled={busy || loading || blocked}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-4.5 w-4.5" />}
            {busy ? 'Starting payment…' : `Pay ${quote ? formatINR(quote.total) : ''}`}
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-subtle">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Your order is confirmed only after payment is verified.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

function SlotOption({ checked, onSelect, children }: { checked: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-start rounded-xl border-2 px-4 py-3 text-left text-sm transition-colors',
        checked ? 'border-primary bg-primary-soft/60' : 'border-line bg-surface hover:border-primary/30',
      )}
    >
      {children}
    </button>
  )
}
