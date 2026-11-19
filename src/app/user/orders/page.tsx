import type { Metadata } from 'next'
import Link from 'next/link'
import QRCode from 'qrcode'
import { ClipboardList, History } from 'lucide-react'
import { requirePortalUser } from '@/lib/auth/guards'
import { env } from '@/lib/env'
import { getActiveOrders, getOrderHistory } from '@/lib/queries/user'
import { formatINR } from '@/lib/money'
import { formatDateTime } from '@/lib/time'
import { buildPickupQrPayload } from '@/lib/orders/codes'
import { Card, CardBody } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/ui/badge'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { OrderProgress } from '@/components/ui/order-progress'

export const metadata: Metadata = { title: 'My Orders' }
export const dynamic = 'force-dynamic'

/** One page for all orders: in progress (with pickup code) on top, past orders below. */
export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePortalUser('USER')
  const page = Math.max(1, Number((await searchParams).page) || 1)
  const [orders, past] = await Promise.all([getActiveOrders(user.id), getOrderHistory(user.id, page)])
  const qrs = await Promise.all(
    orders.map((o) =>
      o.pickupToken
        ? QRCode.toString(buildPickupQrPayload(o.orderNumber, o.pickupToken), { type: 'svg', margin: 0, color: { dark: '#173F35', light: '#FFFFFF' } })
        : null,
    ),
  )

  return (
    <>
      <PageHeader title="My Orders" description="This page updates by itself — no need to refresh." />
      {page === 1 && (orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No orders in progress"
            description="When you place an order, you can track it here."
            action={<ButtonLink href="/user/dashboard">Order food</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((o, idx) => (
            <Card key={o.id} className={o.status === 'READY' ? 'border-success/40 ring-4 ring-success/10' : ''}>
              <CardBody className="grid gap-5 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/user/orders/${o.id}`} className="font-display text-lg font-bold text-ink hover:text-primary">
                      {o.orderNumber}
                    </Link>
                    <OrderStatusBadge status={o.status} refundStatus={o.refund?.status} />
                    {o.payment && <PaymentStatusBadge status={o.payment.status} />}
                  </div>
                  <div className="mt-1 text-sm text-muted">{formatDateTime(o.createdAt, env.timezone)}</div>
                  <p className="mt-3 text-[15px]">{o.items.map((i) => `${i.name} × ${i.quantity}`).join(' · ')}</p>
                  <div className="mt-1 font-semibold text-primary tabular-nums">{formatINR(o.totalPaise)}</div>
                  {o.status !== 'PAYMENT_PENDING' && (
                    <div className="mt-4 max-w-md">
                      <OrderProgress status={o.status} compact />
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ButtonLink href={`/user/orders/${o.id}`} size="sm">Track order</ButtonLink>
                    {o.status === 'PAYMENT_PENDING' && o.payment && (
                      <ButtonLink href={`/user/pay/${o.payment.id}`} size="sm" variant="secondary">Pay now</ButtonLink>
                    )}
                  </div>
                </div>
                {o.pickupToken && qrs[idx] && (
                  <div className="flex items-center gap-4 rounded-2xl bg-bg p-4 md:flex-col md:justify-center">
                    <div className="w-24 shrink-0 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label="Pickup QR code" dangerouslySetInnerHTML={{ __html: qrs[idx]! }} />
                    <div className="text-center">
                      <div className="text-xs text-subtle">Pickup code</div>
                      <div className="font-mono text-lg font-bold tracking-[0.25em] text-primary">{o.pickupToken}</div>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      ))}

      <section className="mt-8" aria-label="Past orders">
        <h2 className="mb-3 text-lg font-bold text-ink">Past orders</h2>
        <Card>
          {past.orders.length === 0 ? (
            <EmptyState icon={History} title="No past orders yet" />
          ) : (
            <ul className="divide-y divide-line">
              {past.orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/user/orders/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-bg sm:px-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{o.orderNumber}</span>
                        <OrderStatusBadge status={o.status} refundStatus={o.refund?.status} />
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
        {past.pages > 1 && (
          <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Pagination">
            {page > 1 && <ButtonLink href={`?page=${page - 1}`} variant="secondary" size="sm">Previous</ButtonLink>}
            <span className="text-sm text-muted">Page {page} of {past.pages}</span>
            {page < past.pages && <ButtonLink href={`?page=${page + 1}`} variant="secondary" size="sm">Next</ButtonLink>}
          </nav>
        )}
      </section>
    </>
  )
}
