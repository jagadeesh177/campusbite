import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, IndianRupee, ReceiptText, RotateCcw } from 'lucide-react'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { requirePortalUser } from '@/lib/auth/guards'
import { staffDashboard } from '@/lib/reports'
import { isSimulatorActive, razorpayMode } from '@/lib/payments/gateway'
import { formatINR, rupeesToPaise } from '@/lib/money'
import { formatDateTime } from '@/lib/time'
import { Card, CardHeader } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/ui/badge'
import { Notice, PageHeader, StatCard } from '@/components/ui/misc'

export const metadata: Metadata = { title: 'Staff dashboard' }
export const dynamic = 'force-dynamic'

/** Today at a glance + latest orders. Charts and trends live in Reports. */
export default async function StaffDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePortalUser('STAFF')
  const [{ denied }, data, latest] = await Promise.all([
    searchParams,
    staffDashboard(),
    db.order.findMany({
      where: { status: { not: 'PAYMENT_PENDING' } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { user: { select: { name: true } }, refunds: { select: { status: true }, take: 1 } },
    }),
  ])
  const k = data.kpis
  const canPayments = user.permissions.includes('PAYMENTS')

  return (
    <>
      <PageHeader eyebrow={`Welcome back, ${user.name.split(' ')[0]}`} title="Today" description="Updates by itself as orders come in." />
      {denied && <Notice tone="warning" className="mb-4">You don&apos;t have permission for that section.</Notice>}
      {env.paymentProvider === 'razorpay' && razorpayMode(env.razorpay.keyId) === 'test' && (
        <Notice tone="warning" className="mb-4" title="Payments are in Razorpay Test Mode">
          Orders go through Razorpay&apos;s test checkout. No real money is collected.
        </Notice>
      )}
      {isSimulatorActive() && (
        <Notice tone="warning" className="mb-4" title="Payments are in test mode">
          No real money is collected until Razorpay keys are added.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sales today" value={formatINR(k.revenueTodayPaise)} icon={IndianRupee} tone="primary" />
        <StatCard label="Orders today" value={k.ordersToday} icon={ReceiptText} tone="info" />
        <StatCard label="Being prepared" value={k.pending} icon={Clock} tone="accent" />
        <StatCard label="Refunds waiting" value={k.pendingRefunds} icon={RotateCcw} tone={k.pendingRefunds > 0 ? 'danger' : 'success'} />
      </div>

      {canPayments && k.pendingRefunds > 0 && (
        <Notice tone="warning" title={`${k.pendingRefunds} refund${k.pendingRefunds > 1 ? 's' : ''} need attention`} className="mt-6">
          <Link href="/staff/payments?tab=refunds" className="font-semibold underline">Review refunds</Link>
        </Notice>
      )}

      <Card className="mt-6">
        <CardHeader title="Latest orders" action={<Link href="/staff/orders" className="text-sm font-semibold text-primary hover:underline">All orders</Link>} />
        {latest.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {latest.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3">
                <span className="font-mono font-semibold">{o.orderNumber}</span>
                <OrderStatusBadge status={o.status} refundStatus={o.refunds[0]?.status} />
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{o.user.name}</span>
                <span className="font-semibold tabular-nums">{formatINR(rupeesToPaise(o.total))}</span>
                <span className="w-full text-xs text-subtle sm:w-auto">{formatDateTime(o.createdAt, env.timezone)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
