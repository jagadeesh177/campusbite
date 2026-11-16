import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'
import { OrderStatusBadge } from '@/components/ui/badge'
import { OrderProgress } from '@/components/ui/order-progress'
import { formatINR } from '@/lib/money'
import { formatTime } from '@/lib/time'
import type { UserOrderView } from '@/lib/queries/user'

export function ActiveOrderCard({ order, tz }: { order: UserOrderView; tz: string }) {
  const ready = order.status === 'READY'
  return (
    <Link
      href={`/user/orders/${order.id}`}
      className={`block rounded-[var(--radius-card)] border bg-surface p-5 shadow-card transition hover:shadow-lift ${ready ? 'border-success/40 ring-4 ring-success/10' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-subtle">{order.orderNumber}</div>
          <div className="mt-1 font-display text-lg font-bold text-ink">
            {ready ? 'Ready for pickup!' : order.status === 'PAYMENT_PENDING' ? 'Waiting for payment' : 'In progress'}
          </div>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>
      {order.status !== 'PAYMENT_PENDING' && (
        <div className="mt-5">
          <OrderProgress status={order.status} />
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <span className="text-muted">
          {order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
        </span>
        <span className="font-semibold tabular-nums">{formatINR(order.totalPaise)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {order.pickupToken ? (
          <span className="rounded-lg bg-primary px-3 py-1.5 font-mono text-sm font-bold tracking-[0.25em] text-white">
            {order.pickupToken}
          </span>
        ) : (
          <span className="text-sm font-medium text-warning-ink">Complete payment to confirm</span>
        )}
        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
          {order.estimatedReadyAt && order.status !== 'READY' && (
            <>
              <Clock className="h-4 w-4" /> ~{formatTime(order.estimatedReadyAt, tz)}
            </>
          )}
          <span className="ml-2 inline-flex items-center gap-1 font-semibold text-primary">
            Track <ArrowRight className="h-4 w-4" />
          </span>
        </span>
      </div>
    </Link>
  )
}
