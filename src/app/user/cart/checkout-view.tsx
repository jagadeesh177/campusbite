'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AlertTriangle, Clock, FlaskConical, Loader2, Lock, ShieldCheck, ShoppingCart, Smartphone, Trash2 } from 'lucide-react'
import { placeOrderAction } from '@/app/actions/user'
import { useCart } from '@/components/portal/cart-context'
import { useServerQuote } from '@/components/user/use-quote'
import { payWithRazorpay } from '@/components/user/razorpay'
import { Card, CardBody } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { EmptyState, FoodImage, Notice } from '@/components/ui/misc'
import { VegMark } from '@/components/ui/badge'
import { QuantityStepper } from '@/components/user/food-card'
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
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Add something tasty from the menu."
          action={<ButtonLink href="/user/dashboard">Browse food</ButtonLink>}
        />
      </Card>
    )
  }

  const blocked = !quote || quote.hasUnavailable || !quote.kitchen.open || quote.total === 0
  const byId = new Map(quote?.lines.map((l) => [l.foodItemId, l]))

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
          <ul className="divide-y divide-line">
            {cart.lines.map((line) => {
              const q = byId.get(line.foodItemId)
              const problem = quote ? (!q ? 'No longer on the menu' : !q.available ? 'Sold out — remove to continue' : null) : null
              return (
                <li key={line.foodItemId} className={cn('flex gap-4 p-4 sm:p-5', problem && 'bg-danger-soft/40')}>
                  <FoodImage src={line.imageUrl} alt={line.name} className="h-16 w-16 shrink-0 rounded-xl sm:h-20 sm:w-20" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <VegMark isVeg={line.isVeg} />
                        <span className="truncate font-semibold">{q?.name ?? line.name}</span>
                      </div>
                      <span className="font-semibold tabular-nums">{formatINR(q?.lineTotalPaise ?? line.unitPaise * line.quantity)}</span>
                    </div>
                    {problem && (
                      <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-danger-ink">
                        <AlertTriangle className="h-4 w-4" /> {problem}
                      </span>
                    )}
                    {q && q.unitPaise !== line.unitPaise && <span className="mt-1 text-sm text-warning-ink">Price updated by the canteen</span>}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <QuantityStepper value={line.quantity} onChange={(v) => cart.setQuantity(line.foodItemId, v)} size="sm" label={line.name} />
                      <button
                        onClick={() => cart.remove(line.foodItemId)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted hover:bg-danger-soft hover:text-danger-ink"
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="border-t border-line px-5 py-3">
            <Link href="/user/dashboard" className="text-sm font-semibold text-primary hover:underline">+ Add more food</Link>
          </div>
        </Card>

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
                <Notice tone="warning" title="Test mode">
                  Payments are in test mode — <strong>no real money is charged</strong>.
                </Notice>
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-warning/60 p-4 text-sm">
                  <FlaskConical className="h-5 w-5 text-warning-ink" /> Test UPI payment
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-6">
        <CardBody>
          <h2 className="font-semibold">Order summary</h2>
          <dl className="mt-4 space-y-2 text-[15px]">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{quote ? formatINR(quote.subtotal) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Convenience fee</dt><dd className="tabular-nums">{quote ? (quote.fees ? formatINR(quote.fees) : 'Free') : '—'}</dd></div>
            <div className="flex justify-between pt-2 text-lg font-bold"><dt>To pay</dt><dd className="tabular-nums text-primary">{quote ? formatINR(quote.total) : '—'}</dd></div>
          </dl>

          {(quoteError || error) && <Notice tone="danger" className="mt-4">{error ?? quoteError}</Notice>}
          {quote?.hasUnavailable && (
            <Notice tone="warning" className="mt-4">
              Some items are sold out. Remove them above to continue.
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
