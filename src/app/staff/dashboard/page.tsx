import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, Ban, CheckCircle2, Clock, GraduationCap, IndianRupee, ReceiptText } from 'lucide-react'
import { requirePortalUser } from '@/lib/auth/guards'
import { staffDashboard } from '@/lib/reports'
import { supabaseConfig } from '@/lib/auth/supabase'
import { isSimulatorActive } from '@/lib/payments/gateway'
import { formatINR } from '@/lib/money'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice, PageHeader, StatCard } from '@/components/ui/misc'
import { BarChart } from '@/components/ui/bar-chart'

export const metadata: Metadata = { title: 'Staff dashboard' }
export const dynamic = 'force-dynamic'

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export default async function StaffDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePortalUser('STAFF')
  const [{ denied }, data] = await Promise.all([searchParams, staffDashboard()])
  const k = data.kpis
  const studentAuthReady = supabaseConfig().configured
  const canPayments = user.permissions.includes('PAYMENTS')

  return (
    <>
      <PageHeader eyebrow={`Welcome back, ${user.name.split(' ')[0]}`} title="Canteen overview" description="Today at a glance — updates live as orders come in." />
      {denied && <Notice tone="warning" className="mb-4">You don&apos;t have permission for that section.</Notice>}

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={studentAuthReady ? 'success' : 'warning'} dot>Student sign-up: {studentAuthReady ? 'Supabase Auth' : 'Supabase not configured'}</Badge>
        <Badge tone={isSimulatorActive() ? 'warning' : 'success'} dot>
          Payments: {isSimulatorActive() ? 'Development simulator (no real money)' : 'Razorpay'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Revenue today" value={formatINR(k.revenueTodayPaise)} icon={IndianRupee} tone="primary" />
        <StatCard label="Orders today" value={k.ordersToday} icon={ReceiptText} tone="info" />
        <StatCard label="In progress" value={k.pending} icon={Clock} tone="accent" />
        <StatCard label="Completed today" value={k.completedToday} icon={CheckCircle2} tone="success" />
        <StatCard label="Cancelled today" value={k.cancelledToday} icon={Ban} tone="danger" />
        <StatCard label="Registered students" value={k.students} icon={GraduationCap} tone="primary" />
      </div>

      {canPayments && k.pendingRefunds > 0 && (
        <Notice tone="warning" title={`${k.pendingRefunds} refund${k.pendingRefunds > 1 ? 's' : ''} need attention`} className="mt-6">
          <Link href="/staff/payments?tab=refunds" className="font-semibold underline">Review refunds</Link>
        </Notice>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Sales — last 14 days" description="Revenue from paid orders (refunds excluded)." />
          <CardBody>
            <BarChart
              label="Daily revenue, last 14 days"
              data={data.series.map((p) => ({ label: dayLabel(p.bucket), value: p.revenuePaise, sublabel: `${dayLabel(p.bucket)} · ${p.orders} orders` }))}
              format={formatINR}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Popular items" description="Last 30 days" />
          <CardBody>
            <ol className="space-y-3">
              {data.popular.map((item, i) => {
                const max = data.popular[0]?.quantity || 1
                return (
                  <li key={item.foodItemId}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium"><span className="mr-2 text-subtle">{i + 1}</span>{item.name}</span>
                      <span className="tabular-nums text-muted">{item.quantity} sold</span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-bg">
                      <div className="h-2 rounded-full bg-accent" style={{ width: `${(item.quantity / max) * 100}%` }} />
                    </div>
                  </li>
                )
              })}
              {data.popular.length === 0 && <li className="text-sm text-muted"><AlertTriangle className="mr-1 inline h-4 w-4" /> No sales yet.</li>}
            </ol>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
