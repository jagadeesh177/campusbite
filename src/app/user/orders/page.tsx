import type { Metadata } from 'next'
import Link from 'next/link'
import QRCode from 'qrcode'
import { ClipboardList } from 'lucide-react'
import { requirePortalUser } from '@/lib/auth/guards'
import { env } from '@/lib/env'
import { getActiveOrders } from '@/lib/queries/user'
import { formatINR } from '@/lib/money'
import { formatDateTime } from '@/lib/time'
import { buildPickupQrPayload } from '@/lib/orders/codes'
import { Card, CardBody } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/ui/badge'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { OrderProgress } from '@/components/ui/order-progress'

export const metadata: Metadata = { title: 'My orders' }
export const dynamic = 'force-dynamic'

export default async function MyOrdersPage() {
  const user = await requirePortalUser('USER')
  const orders = await getActiveOrders(user.id)
  const qrs = await Promise.all(
    orders.map((o) =>
      o.pickupToken
        ? QRCode.toString(buildPickupQrPayload(o.orderNumber, o.pickupToken), { type: 'svg', margin: 0, color: { dark: '#173F35', light: '#FFFFFF' } })
        : null,
    ),
  )

  return (
    <>
      <PageHeader
        title="My orders"
        description="Orders in progress. Updates arrive live — no need to refresh."
        action={<ButtonLink href="/user/history" variant="secondary">Order history</ButtonLink>}
      />
      {orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No active orders"
            description="When you place an order, you can track it here."
            action={<ButtonLink href="/user/menu">Order food</ButtonLink>}
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
                    <OrderStatusBadge status={o.status} />
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
      )}
    </>
  )
}
