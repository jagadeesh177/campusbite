import type { Metadata } from 'next'
import Link from 'next/link'
import type { OrderStatus, Prisma } from '@prisma/client'
import { Search } from 'lucide-react'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { requirePortalUser } from '@/lib/auth/guards'
import { formatINR, rupeesToPaise } from '@/lib/money'
import { formatDateTime } from '@/lib/time'
import { Card } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/ui/badge'
import { Input } from '@/components/ui/form'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { cn } from '@/lib/cn'

export const metadata: Metadata = { title: 'Orders' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30
const FILTERS: { key: string; label: string; statuses?: OrderStatus[] }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'In progress', statuses: ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY'] },
  { key: 'collected', label: 'Collected', statuses: ['COLLECTED'] },
  { key: 'unpaid', label: 'Awaiting payment', statuses: ['PAYMENT_PENDING'] },
  { key: 'refunds', label: 'Refunds', statuses: ['REFUND_PENDING', 'REFUNDED'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED'] },
]

/** Every order on the platform, searchable — read-only for staff. */
export default async function StaffOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>
}) {
  await requirePortalUser('STAFF')
  const sp = await searchParams
  const filter = FILTERS.find((f) => f.key === sp.filter) ?? FILTERS[0]
  const q = (sp.q ?? '').trim().slice(0, 80)
  const page = Math.max(1, Number(sp.page) || 1)

  const where: Prisma.OrderWhereInput = {
    ...(filter.statuses ? { status: { in: filter.statuses } } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: 'insensitive' } },
            { user: { name: { contains: q, mode: 'insensitive' } } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        user: { select: { id: true, name: true } },
        items: { select: { nameSnapshot: true, quantity: true } },
      },
    }),
    db.order.count({ where }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const link = (p: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams()
    const merged = { filter: filter.key, q, page, ...p }
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== '' && !(k === 'filter' && v === 'all') && !(k === 'page' && v === 1)) params.set(k, String(v))
    const s = params.toString()
    return s ? `?${s}` : '?'
  }

  return (
    <>
      <PageHeader title="Orders" description="Every order placed on CampusBite." />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={link({ filter: f.key, page: 1 })}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-semibold',
                filter.key === f.key ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-ink/80',
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="relative w-full lg:w-80" role="search">
          <input type="hidden" name="filter" value={filter.key} />
          <label className="sr-only" htmlFor="q">Search orders</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input id="q" name="q" defaultValue={q} placeholder="Order number, name or email" className="pl-10" />
        </form>
      </div>

      <Card>
        {orders.length === 0 ? (
          <EmptyState icon={Search} title="No orders found" description={q ? 'Try a different search.' : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-subtle">
                  <th className="px-6 py-3 font-medium">Order</th>
                  <th className="px-3 py-3 font-medium">User</th>
                  <th className="px-3 py-3 font-medium">Items</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Placed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-bg">
                    <td className="px-6 py-3 font-mono font-semibold whitespace-nowrap">{o.orderNumber}</td>
                    <td className="px-3 py-3">
                      <Link href={`/staff/users/${o.user.id}`} className="font-medium hover:text-primary hover:underline">{o.user.name}</Link>
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-3 text-muted">
                      {o.items.map((i) => `${i.nameSnapshot} × ${i.quantity}`).join(', ')}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatINR(rupeesToPaise(o.total))}</td>
                    <td className="px-3 py-3"><OrderStatusBadge status={o.status} /></td>
                    <td className="px-6 py-3 whitespace-nowrap text-subtle">{formatDateTime(o.createdAt, env.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-muted">Page {page} of {pages} · {total} orders</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={link({ page: page - 1 })} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Previous</Link>}
            {page < pages && <Link href={link({ page: page + 1 })} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold">Next</Link>}
          </div>
        </div>
      )}
    </>
  )
}
