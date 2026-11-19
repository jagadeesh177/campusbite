'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AlertTriangle, ArrowRight, ChevronRight, Clock, FlaskConical, Loader2, Lock, ShieldCheck, ShoppingCart, Trash2 } from 'lucide-react'
import { placeOrderAction, savePhoneAction } from '@/app/actions/user'
import { useCart } from '@/components/portal/cart-context'
import { useServerQuote } from '@/components/user/use-quote'
import { payWithRazorpay, toIndianMobile } from '@/components/user/razorpay'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { EmptyState, FoodImage, Notice } from '@/components/ui/misc'
import { VegMark } from '@/components/ui/badge'
import { QuantityStepper } from '@/components/user/food-card'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/cn'

export function CheckoutView({
  tz,
  provider,
  razorpayTest = false,
  user,
}: {
  tz: string
  provider: 'razorpay' | 'simulator'
  razorpayTest?: boolean
  user: { name: string; email: string; phone?: string | null }
}) {
  const cart = useCart()
  const router = useRouter()
  const { quote, error: quoteError, loading } = useServerQuote()
  const [slot, setSlot] = useState<string>('asap')
  const [slotsOpen, setSlotsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const savedPhone = toIndianMobile(user.phone)
  const [phone, setPhone] = useState('')
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
    const contact = savedPhone ?? (provider === 'razorpay' ? toIndianMobile(phone) : null)
    if (provider === 'razorpay' && !contact) {
      setError('Enter your 10-digit mobile number to pay.')
      return
    }
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
    if (provider === 'razorpay' && !savedPhone && contact) await savePhoneAction(contact) // asked only once
    cart.clear() // order now exists server-side; payment can be retried from the order page

    if (session.provider === 'SIMULATOR') {
      router.push(`/user/pay/${session.paymentId}`)
      return
    }
    try {
      const outcome = await payWithRazorpay(session, { name: user.name, email: user.email, contact })
      // Full page load (not client navigation): the order page is re-read from
      // the server, which is the only place that decides whether it is paid.
      window.location.assign(`/user/orders/${session.orderId}${outcome === 'dismissed' ? '?payment=cancelled' : '?paid=1'}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
      window.location.assign(`/user/orders/${session.orderId}?payment=failed`)
    }
  }

  const slotLabel = slot === 'asap' ? 'As soon as possible' : timeFmt.format(new Date(slot))
  const needsPhone = provider === 'razorpay' && !savedPhone

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28 lg:pb-6">
      {/* Order summary */}
      <section aria-label="Order summary">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Order summary</h2>
        <Card>
          <ul className="divide-y divide-line">
            {cart.lines.map((line) => {
              const q = byId.get(line.foodItemId)
              const problem = quote ? (!q ? 'No longer on the menu' : !q.available ? 'Sold out — remove to continue' : null) : null
              return (
                <li key={line.foodItemId} className={cn('flex items-center gap-3 p-3 sm:p-4', problem && 'bg-danger-soft/40')}>
                  <FoodImage src={line.imageUrl} alt={line.name} className="h-14 w-14 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <VegMark isVeg={line.isVeg} />
                      <span className="truncate font-semibold">{q?.name ?? line.name}</span>
                    </div>
                    <div className="text-xs text-muted">
                      {formatINR(q?.unitPaise ?? line.unitPaise)} · {line.quantity} × item
                    </div>
                    {problem && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-danger-ink">
                        <AlertTriangle className="h-3.5 w-3.5" /> {problem}
                      </span>
                    )}
                    {q && q.unitPaise !== line.unitPaise && <span className="block text-xs text-warning-ink">Price updated by the canteen</span>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="font-semibold tabular-nums">{formatINR(q?.lineTotalPaise ?? line.unitPaise * line.quantity)}</span>
                    {problem ? (
                      <button
                        onClick={() => cart.remove(line.foodItemId)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-danger-ink hover:bg-danger-soft"
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </button>
                    ) : (
                      <QuantityStepper value={line.quantity} onChange={(v) => cart.setQuantity(line.foodItemId, v)} size="sm" label={line.name} />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
            <Link href="/user/dashboard" className="inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline">+ Add more items</Link>
            <button onClick={() => cart.clear()} className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-muted hover:text-danger-ink">
              <Trash2 className="h-4 w-4" /> Clear
            </button>
          </div>
        </Card>
      </section>

      {/* Pickup time: one row, tap to change */}
      <Card>
        <button
          type="button"
          onClick={() => setSlotsOpen((v) => !v)}
          aria-expanded={slotsOpen}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        >
          <Clock className="h-5 w-5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-subtle">Pickup at the counter</span>
            <span className="block font-semibold">
              {slotLabel}
              {slot === 'asap' && quote ? <span className="font-normal text-muted"> · ~{quote.estimatedPrepMinutes} min</span> : null}
            </span>
          </span>
          <ChevronRight className={cn('h-5 w-5 text-subtle transition-transform', slotsOpen && 'rotate-90')} />
        </button>
        {slotsOpen && (
          <div className="grid grid-cols-2 gap-2 border-t border-line p-3 sm:grid-cols-3">
            <SlotOption checked={slot === 'asap'} onSelect={() => { setSlot('asap'); setSlotsOpen(false) }}>
              <span className="font-semibold">As soon as possible</span>
              <span className="text-xs text-muted">~{quote?.estimatedPrepMinutes ?? '—'} min</span>
            </SlotOption>
            {quote?.pickupSlots.slice(0, 8).map((s) => (
              <SlotOption key={s} checked={slot === s} onSelect={() => { setSlot(s); setSlotsOpen(false) }}>
                <span className="font-semibold">{timeFmt.format(new Date(s))}</span>
                <span className="text-xs text-muted">Pickup slot</span>
              </SlotOption>
            ))}
          </div>
        )}
      </Card>

      {/* Bill */}
      <Card>
        <dl className="space-y-1.5 px-4 py-3.5 text-[15px]">
          <div className="flex justify-between"><dt className="text-muted">Item total</dt><dd className="tabular-nums">{quote ? formatINR(quote.subtotal) : '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Convenience fee</dt><dd className="tabular-nums">{quote ? (quote.fees ? formatINR(quote.fees) : 'Free') : '—'}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 font-bold"><dt>To pay</dt><dd className="tabular-nums">{quote ? formatINR(quote.total) : '—'}</dd></div>
        </dl>
      </Card>

      {needsPhone && (
        <Card>
          <div className="px-4 py-3.5">
            <label htmlFor="pay-mobile" className="mb-1.5 block text-sm font-medium">Mobile number</label>
            <div className="flex items-center rounded-xl border border-line bg-surface focus-within:border-primary">
              <span className="pl-3 text-muted">+91</span>
              <input
                id="pay-mobile"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={14}
                placeholder="10-digit mobile"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12 w-full rounded-xl bg-transparent px-2 text-base outline-none sm:text-[15px]"
              />
            </div>
            <p className="mt-1 text-xs text-muted">Asked once and saved to your profile.</p>
          </div>
        </Card>
      )}

      {provider === 'razorpay' && razorpayTest && (
        <Notice tone="warning" title="Razorpay Test Mode">
          <strong>No real money is charged.</strong> Use Razorpay&apos;s test UPI ID or test card on the payment screen.
        </Notice>
      )}
      {provider !== 'razorpay' && (
        <Notice tone="warning" title="Test mode">
          <span className="inline-flex items-center gap-1.5"><FlaskConical className="h-4 w-4" /> Payments are in test mode — <strong>no real money is charged</strong>.</span>
        </Notice>
      )}

      {(quoteError || error) && <Notice tone="danger">{error ?? quoteError}</Notice>}
      {quote?.hasUnavailable && <Notice tone="warning">Some items are sold out. Remove them to continue.</Notice>}
      {quote && !quote.kitchen.open && <Notice tone="warning">{quote.kitchen.message}</Notice>}

      <p className="flex items-center justify-center gap-1.5 text-xs text-subtle">
        <ShieldCheck className="h-3.5 w-3.5 text-accent" /> UPI, cards and net banking · secured by Razorpay · confirmed only after payment is verified
      </p>

      {/* One big Pay bar: sits above the bottom tabs on phones, inline on desktop */}
      <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 px-4 lg:static lg:px-0">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={pay}
            disabled={busy || loading || blocked}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-3 text-white shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:opacity-60"
          >
            <span className="text-left leading-tight">
              <span className="block text-lg font-bold tabular-nums">{quote ? formatINR(quote.total) : '—'}</span>
              <span className="block text-[11px] font-semibold tracking-wide uppercase opacity-80">Total</span>
            </span>
            <span className="inline-flex items-center gap-2 font-semibold">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-4.5 w-4.5" />}
              {busy ? 'Opening payment…' : 'Pay & Place Order'}
              {!busy && <ArrowRight className="h-5 w-5" />}
            </span>
          </button>
        </div>
      </div>
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
