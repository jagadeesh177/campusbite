import type { Metadata } from 'next'
import Link from 'next/link'
import { History } from 'lucide-react'
import { requirePortalUser } from '@/lib/auth/guards'
import { env } from '@/lib/env'
import { getOrderHistory } from '@/lib/queries/user'
import { formatINR } from '@/lib/money'
import { formatDateTime } from '@/lib/time'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { OrderStatusBadge } from '@/components/ui/badge'
import { EmptyState, PageHeader } from '@/components/ui/misc'

export const metadata: Metadata = { title: 'Order history' }
export const dynamic = 'force-dynamic'

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePortalUser('USER')
  const page = Math.max(1, Number((await searchParams).page) || 1)
  const { orders, pages, total } = await getOrderHistory(user.id, page)

  return (
    <>
      <PageHeader title="Order history" description={`${total} past order${total === 1 ? '' : 's'}`} />
      <Card>
        {orders.length === 0 ? (
          <EmptyState icon={History} title="No past orders yet" action={<ButtonLink href="/user/menu">Order something</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/user/orders/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-bg sm:px-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{o.orderNumber}</span>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <div className="mt-0.5 truncate text-sm text-muted">{o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{formatINR(o.totalPaise)}</div>
                    <div className="text-xs text-subtle">{formatDateTime(o.createdAt, env.timezone)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
          {page > 1 && <ButtonLink href={`?page=${page - 1}`} variant="secondary" size="sm">Previous</ButtonLink>}
          <span className="text-sm text-muted">Page {page} of {pages}</span>
          {page < pages && <ButtonLink href={`?page=${page + 1}`} variant="secondary" size="sm">Next</ButtonLink>}
        </nav>
      )}
    </>
  )
}
