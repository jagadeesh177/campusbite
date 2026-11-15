import type { Metadata } from 'next'
import Link from 'next/link'
import type { PaymentStatus, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { requirePortalUser } from '@/lib/auth/guards'
import { formatINR, rupeesToPaise } from '@/lib/money'
import { formatDateTime } from '@/lib/time'
import { Card } from '@/components/ui/card'
import { Badge, OrderStatusBadge, PaymentStatusBadge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/misc'
import { ProcessRefundButton } from '@/components/staff/buttons'
import { cn } from '@/lib/cn'

export const metadata: Metadata = { title: 'Payments' }
export const dynamic = 'force-dynamic'

const FILTERS: { key: string; label: string; status?: PaymentStatus }[] = [
  { key: 'all', label: 'All' },
  { key: 'succeeded', label: 'Successful', status: 'SUCCEEDED' },
  { key: 'pending', label: 'Pending', status: 'CREATED' },
  { key: 'failed', label: 'Failed', status: 'FAILED' },
  { key: 'refunded', label: 'Refunded', status: 'REFUNDED' },
]

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; filter?: string }> }) {
  await requirePortalUser('STAFF', 'PAYMENTS')
  const sp = await searchParams
  const tab = sp.tab === 'refunds' ? 'refunds' : 'transactions'
  const filter = FILTERS.find((f) => f.key === sp.filter) ?? FILTERS[0]

  return (
    <>
      <PageHeader title="Payments" description="Every transaction and refund, with gateway references for reconciliation." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-line bg-surface p-1 shadow-card">
          {[{ key: 'transactions', label: 'Transactions' }, { key: 'refunds', label: 'Refunds' }].map((t) => (
            <Link key={t.key} href={`?tab=${t.key}`} className={cn('rounded-lg px-4 py-2 text-sm font-semibold', tab === t.key ? 'bg-primary text-white' : 'text-ink/80 hover:text-primary')}>
              {t.label}
            </Link>
          ))}
        </div>
        {tab === 'transactions' && (
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link key={f.key} href={`?tab=transactions&filter=${f.key}`} className={cn('rounded-full border px-3 py-1.5 text-sm font-semibold', filter.key === f.key ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-ink/80')}>
                {f.label}
              </Link>
            ))}
          </div>
        )}
      </div>
      {tab === 'transactions' ? <Transactions status={filter.status} /> : <Refunds />}
    </>
  )
}

async function Transactions({ status }: { status?: PaymentStatus }) {
  const where: Prisma.PaymentWhereInput = status ? { status } : {}
  const payments = await db.payment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { order: { select: { orderNumber: true, status: true, user: { select: { name: true } } } } },
  })
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-subtle">
              <th className="px-6 py-3 font-medium">Time</th>
              <th className="px-3 py-3 font-medium">Order</th>
              <th className="px-3 py-3 font-medium">Student</th>
              <th className="px-3 py-3 font-medium">Payment</th>
              <th className="px-3 py-3 text-right font-medium">Amount</th>
              <th className="px-3 py-3 font-medium">Gateway reference</th>
              <th className="px-6 py-3 font-medium">Verified via</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-bg">
                <td className="px-6 py-3 whitespace-nowrap text-subtle">{formatDateTime(p.createdAt, env.timezone)}</td>
                <td className="px-3 py-3">
                  <div className="font-mono font-semibold whitespace-nowrap">{p.order.orderNumber}</div>
                  <OrderStatusBadge status={p.order.status} />
                </td>
                <td className="px-3 py-3">{p.order.user.name}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <PaymentStatusBadge status={p.status} />
                    {p.provider === 'SIMULATOR' && <Badge tone="warning">Simulated</Badge>}
                  </div>
                  {p.failureReason && <div className="mt-1 text-xs text-danger-ink">{p.failureReason}</div>}
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatINR(rupeesToPaise(p.amount))}</td>
                <td className="px-3 py-3 font-mono text-xs">
                  <div>{p.gatewayPaymentId ?? '—'}</div>
                  <div className="text-subtle">{p.gatewayOrderId}</div>
                </td>
                <td className="px-6 py-3 text-subtle">{p.verifiedVia ?? '—'}{p.method ? ` · ${p.method}` : ''}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-muted">No transactions.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

async function Refunds() {
  const refunds = await db.refund.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: { order: { select: { orderNumber: true, user: { select: { name: true } } } }, payment: { select: { provider: true, gatewayPaymentId: true } } },
  })
  const tone = { PENDING: 'warning', PROCESSING: 'info', PROCESSED: 'success', FAILED: 'danger' } as const
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-subtle">
              <th className="px-6 py-3 font-medium">Requested</th>
              <th className="px-3 py-3 font-medium">Order</th>
              <th className="px-3 py-3 font-medium">Reason</th>
              <th className="px-3 py-3 text-right font-medium">Amount</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-6 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {refunds.map((r) => (
              <tr key={r.id} className="hover:bg-bg">
                <td className="px-6 py-3 whitespace-nowrap text-subtle">{formatDateTime(r.createdAt, env.timezone)}</td>
                <td className="px-3 py-3">
                  <div className="font-mono font-semibold whitespace-nowrap">{r.order.orderNumber}</div>
                  <div className="text-xs text-subtle">{r.order.user.name}</div>
                </td>
                <td className="px-3 py-3">{r.reason}{r.failureReason && <div className="mt-1 text-xs text-danger-ink">{r.failureReason}</div>}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatINR(rupeesToPaise(r.amount))}</td>
                <td className="px-3 py-3">
                  <Badge tone={tone[r.status]} dot>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge>
                  {r.gatewayRefundId && <div className="mt-1 font-mono text-xs text-subtle">{r.gatewayRefundId}</div>}
                </td>
                <td className="px-6 py-3 text-right">
                  {(r.status === 'PENDING' || r.status === 'FAILED') && (
                    <ProcessRefundButton refundId={r.id} label={r.status === 'FAILED' ? 'Retry refund' : 'Process refund'} />
                  )}
                </td>
              </tr>
            ))}
            {refunds.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-muted">No refunds.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
