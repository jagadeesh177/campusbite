import type { Metadata } from 'next'
import Link from 'next/link'
import type { Prisma } from '@prisma/client'
import { History, Search } from 'lucide-react'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { requirePortalUser } from '@/lib/auth/guards'
import { formatINR, rupeesToPaise } from '@/lib/money'
import { formatDateTime } from '@/lib/time'
import { Card } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/ui/badge'
import { Input } from '@/components/ui/form'
import { EmptyState, PageHeader } from '@/components/ui/misc'

export const metadata: Metadata = { title: 'Order history' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

/** Finished orders (collected, refunded, or cancelled after payment). */
export default async function CanteenHistory({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requirePortalUser('CANTEEN', 'ORDERS')
  const sp = await searchParams
  const q = (sp.q ?? '').trim().slice(0, 40)
  const page = Math.max(1, Number(sp.page) || 1)

  const where: Prisma.OrderWhereInput = {
    OR: [{ status: { in: ['COLLECTED', 'REFUNDED', 'REFUND_PENDING'] } }, { status: 'CANCELLED', confirmedAt: { not: null } }],
    ...(q ? { AND: [{ OR: [{ orderNumber: { contains: q, mode: 'insensitive' } }, { user: { name: { contains: q, mode: 'insensitive' } } }] }] } : {}),
  }
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { user: { select: { name: true } }, items: { select: { nameSnapshot: true, quantity: true } } },
    }),
    db.order.count({ where }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const qs = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`

  return (
    <>
      <PageHeader title="Order history" description="Collected, refunded and cancelled orders." />
      <form className="relative mb-5 max-w-sm" role="search">
        <label className="sr-only" htmlFor="q">Search history</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input id="q" name="q" defaultValue={q} placeholder="Order number or name" className="pl-10" />
      </form>
      <Card>
        {orders.length === 0 ? (
          <EmptyState icon={History} title={q ? 'No matching orders' : 'No finished orders yet'} />
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold">{o.orderNumber}</span>
                    <OrderStatusBadge status={o.status} />
                    <span className="text-sm text-muted">{o.user.name}</span>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-muted">{o.items.map((i) => `${i.nameSnapshot} × ${i.quantity}`).join(', ')}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{formatINR(rupeesToPaise(o.total))}</div>
                  <div className="text-xs text-subtle">{formatDateTime(o.updatedAt, env.timezone)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Pagination">
          {page > 1 && <Link href={qs(page - 1)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Previous</Link>}
          <span className="text-sm text-muted">Page {page} of {pages}</span>
          {page < pages && <Link href={qs(page + 1)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Next</Link>}
        </nav>
      )}
    </>
  )
}
