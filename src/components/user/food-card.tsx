'use client'

import { Clock, Minus, Plus } from 'lucide-react'
import { VegMark } from '@/components/ui/badge'
import { FoodImage } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { useCart } from '@/components/portal/cart-context'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/cn'
import type { MenuItemView } from '@/lib/queries/user'

export function QuantityStepper({
  value,
  onChange,
  size = 'md',
  label,
}: {
  value: number
  onChange: (v: number) => void
  size?: 'sm' | 'md'
  label: string
}) {
  const btn = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  return (
    <div className="inline-flex items-center rounded-xl border border-primary/15 bg-primary-soft" role="group" aria-label={`Quantity of ${label}`}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        className={cn(btn, 'flex items-center justify-center rounded-l-xl text-primary hover:bg-primary/10')}
        aria-label={value === 1 ? `Remove ${label}` : `Decrease ${label}`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-7 text-center text-sm font-bold text-primary tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= 10}
        className={cn(btn, 'flex items-center justify-center rounded-r-xl text-primary hover:bg-primary/10 disabled:opacity-40')}
        aria-label={`Increase ${label}`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

export function FoodCard({ item, layout = 'grid' }: { item: MenuItemView; layout?: 'grid' | 'row' }) {
  const cart = useCart()
  const qty = cart.quantityOf(item.id)
  const add = () =>
    cart.add({ foodItemId: item.id, name: item.name, unitPaise: item.pricePaise, imageUrl: item.imageUrl, isVeg: item.isVeg })

  const action = !item.isAvailable ? (
    <span className="rounded-lg bg-[#EEF2EF] px-3 py-1.5 text-xs font-semibold text-subtle">Sold out</span>
  ) : qty > 0 ? (
    <QuantityStepper value={qty} onChange={(v) => cart.setQuantity(item.id, v)} size="sm" label={item.name} />
  ) : (
    <Button size="sm" onClick={add} aria-label={`Add ${item.name} to cart`}>
      <Plus className="h-4 w-4" /> Add
    </Button>
  )

  if (layout === 'row') {
    return (
      <div className={cn('flex gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card', !item.isAvailable && 'opacity-70')}>
        <FoodImage src={item.imageUrl} alt={item.name} className="h-24 w-24 shrink-0 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <VegMark isVeg={item.isVeg} />
            <h3 className="truncate font-semibold text-ink">{item.name}</h3>
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.description}</p>
          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="font-semibold text-primary tabular-nums">{formatINR(item.pricePaise)}</span>
            {action}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card transition hover:shadow-lift',
        !item.isAvailable && 'opacity-75',
      )}
    >
      <div className="relative">
        <FoodImage src={item.imageUrl} alt={item.name} className="aspect-[16/9] w-full sm:aspect-[4/3]" />
        {item.isPopular && item.isAvailable && (
          <span className="absolute top-3 left-3 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-semibold text-accent-ink shadow-sm">
            ★ Popular
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2">
          <VegMark isVeg={item.isVeg} className="mt-1" />
          <h3 className="font-semibold leading-snug text-ink">{item.name}</h3>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{item.description}</p>
        <div className="mt-2 flex items-center gap-3 text-xs text-subtle">
          <span className="rounded-md bg-bg px-2 py-0.5 font-medium">{item.categoryName}</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {item.prepTimeMinutes} min
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="text-lg font-bold text-primary tabular-nums">{formatINR(item.pricePaise)}</span>
          {action}
        </div>
      </div>
    </div>
  )
}
