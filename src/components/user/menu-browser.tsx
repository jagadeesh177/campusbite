'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search, ShoppingCart, UtensilsCrossed } from 'lucide-react'
import { FoodCard } from './food-card'
import { EmptyState } from '@/components/ui/misc'
import { buttonClasses } from '@/components/ui/button'
import { useCart } from '@/components/portal/cart-context'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/cn'
import type { MenuItemView } from '@/lib/queries/user'

export function MenuBrowser({
  categories,
  items,
  initialCategory,
}: {
  categories: { id: string; name: string; slug: string; count: number }[]
  items: MenuItemView[]
  initialCategory?: string
}) {
  const [category, setCategory] = useState(initialCategory ?? 'all')
  const [query, setQuery] = useState('')
  const [vegOnly, setVegOnly] = useState(false)
  const cart = useCart()

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cat = categories.find((c) => c.slug === category)
    return items.filter(
      (i) =>
        (!cat || i.categoryId === cat.id) &&
        (!vegOnly || i.isVeg) &&
        (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)),
    )
  }, [items, categories, category, query, vegOnly])

  const cartTotal = cart.lines.reduce((s, l) => s + l.unitPaise * l.quantity, 0)

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search the menu</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dosa, sandwich, coffee…"
            className="h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-[15px] shadow-[inset_0_1px_1px_rgb(23_63_53/0.03)] focus:border-accent focus:shadow-[var(--shadow-focus)] focus:outline-none"
          />
        </label>
        <label className="inline-flex h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface px-4 text-sm font-medium">
          <input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} className="h-4 w-4 accent-[var(--color-success)]" />
          Veg only
        </label>
      </div>

      <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Categories">
        <div className="flex gap-2">
          {[{ slug: 'all', name: 'All', count: items.filter((i) => i.isAvailable).length }, ...categories].map((c) => (
            <button
              key={c.slug}
              role="tab"
              aria-selected={category === c.slug}
              onClick={() => setCategory(c.slug)}
              className={cn(
                'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                category === c.slug
                  ? 'border-primary bg-primary text-white'
                  : 'border-line bg-surface text-ink/80 hover:border-primary/30 hover:text-primary',
              )}
            >
              {c.name}
              <span className={cn('ml-1.5 text-xs', category === c.slug ? 'text-white/70' : 'text-subtle')}>{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="Nothing matches" description="Try a different search or category." className="mt-6" />
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <FoodCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {cart.count > 0 && (
        <div className="fixed inset-x-4 bottom-20 z-20 lg:static lg:mt-8">
          <Link
            href="/user/cart"
            className={buttonClasses('primary', 'xl', 'w-full justify-between shadow-lift lg:w-auto lg:min-w-80')}
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-accent" />
              {cart.count} item{cart.count > 1 ? 's' : ''} in cart
            </span>
            <span className="tabular-nums">{formatINR(cartTotal)} →</span>
          </Link>
        </div>
      )}
    </div>
  )
}
