'use client'

import Link from 'next/link'
import { AlertTriangle, Loader2, ShoppingCart, Trash2 } from 'lucide-react'
import { useCart } from '@/components/portal/cart-context'
import { QuantityStepper } from '@/components/user/food-card'
import { useServerQuote } from '@/components/user/use-quote'
import { Card, CardBody } from '@/components/ui/card'
import { ButtonLink, buttonClasses } from '@/components/ui/button'
import { VegMark } from '@/components/ui/badge'
import { EmptyState, FoodImage, Notice } from '@/components/ui/misc'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/cn'

export function CartView() {
  const cart = useCart()
  const { quote, error, loading } = useServerQuote()

  if (cart.lines.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Add something tasty from the menu."
          action={<ButtonLink href="/user/menu">Browse menu</ButtonLink>}
        />
      </Card>
    )
  }

  const byId = new Map(quote?.lines.map((l) => [l.foodItemId, l]))
  const canCheckout = !!quote && !quote.hasUnavailable && quote.total > 0 && quote.kitchen.open && !loading

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      <Card>
        <ul className="divide-y divide-line">
          {cart.lines.map((line) => {
            const q = byId.get(line.foodItemId)
            const unavailable = q && !q.available
            const missing = quote && !q
            return (
              <li key={line.foodItemId} className={cn('flex gap-4 p-4 sm:p-5', (unavailable || missing) && 'bg-danger-soft/40')}>
                <FoodImage src={line.imageUrl} alt={line.name} className="h-20 w-20 shrink-0 rounded-xl" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <VegMark isVeg={line.isVeg} />
                      <span className="truncate font-semibold">{q?.name ?? line.name}</span>
                    </div>
                    <span className="font-semibold tabular-nums">{formatINR(q?.lineTotalPaise ?? line.unitPaise * line.quantity)}</span>
                  </div>
                  <span className="text-sm text-muted tabular-nums">{formatINR(q?.unitPaise ?? line.unitPaise)} each</span>
                  {(unavailable || missing) && (
                    <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-danger-ink">
                      <AlertTriangle className="h-4 w-4" /> {missing ? 'No longer on the menu' : 'Sold out — remove to continue'}
                    </span>
                  )}
                  {q && q.unitPaise !== line.unitPaise && (
                    <span className="mt-1 text-sm text-warning-ink">Price updated by the canteen</span>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <QuantityStepper value={line.quantity} onChange={(v) => cart.setQuantity(line.foodItemId, v)} size="sm" label={line.name} />
                    <button onClick={() => cart.remove(line.foodItemId)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted hover:bg-danger-soft hover:text-danger-ink">
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="lg:sticky lg:top-6">
        <CardBody>
          <h2 className="font-semibold">Order summary</h2>
          {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
          <dl className="mt-4 space-y-2.5 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular-nums">{quote ? formatINR(quote.subtotal) : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Convenience fee</dt>
              <dd className="tabular-nums">{quote ? (quote.fees ? formatINR(quote.fees) : 'Free') : '—'}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums text-primary">
                {loading && !quote ? <Loader2 className="h-4 w-4 animate-spin" /> : quote ? formatINR(quote.total) : '—'}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-subtle">Prices are confirmed by the canteen at checkout.</p>
          {quote && !quote.kitchen.open && <Notice tone="warning" className="mt-4">{quote.kitchen.message}</Notice>}
          <Link
            href="/user/checkout"
            aria-disabled={!canCheckout}
            className={buttonClasses('primary', 'lg', cn('mt-5 w-full', !canCheckout && 'pointer-events-none opacity-50'))}
          >
            Proceed to checkout
          </Link>
          <Link href="/user/menu" className="mt-3 block text-center text-sm font-semibold text-primary hover:underline">
            Add more items
          </Link>
        </CardBody>
      </Card>
    </div>
  )
}
