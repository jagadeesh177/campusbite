import type { Metadata } from 'next'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { requirePortalUser } from '@/lib/auth/guards'
import { env } from '@/lib/env'
import { fillDays, ordersByHour, salesSeries, topItems, type Granularity } from '@/lib/reports'
import { formatINR } from '@/lib/money'
import { startOfZonedDay } from '@/lib/time'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { buttonClasses } from '@/components/ui/button'
import { PageHeader, StatCard } from '@/components/ui/misc'
import { BarChart } from '@/components/ui/bar-chart'
import { IndianRupee, ReceiptText, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/cn'

export const metadata: Metadata = { title: 'Reports' }
export const dynamic = 'force-dynamic'

const RANGES: Record<Granularity, { label: string; days: number }> = {
  day: { label: 'Daily', days: 30 },
  week: { label: 'Weekly', days: 7 * 12 },
  month: { label: 'Monthly', days: 365 },
}

function bucketLabel(iso: string, g: Granularity) {
  const d = new Date(`${iso}T00:00:00Z`)
  if (g === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requirePortalUser('STAFF', 'REPORTS')
  const view = ((await searchParams).view ?? 'day') as Granularity
  const g: Granularity = view in RANGES ? view : 'day'
  const now = new Date()
  const since = new Date(startOfZonedDay(now, env.timezone).getTime() - (RANGES[g].days - 1) * 86_400_000)

  const [series, items, hours] = await Promise.all([salesSeries(g, since), topItems(since, 10), ordersByHour(since)])
  const points = g === 'day' ? fillDays(series, RANGES[g].days, now) : series
  const totalRevenue = points.reduce((s, p) => s + p.revenuePaise, 0)
  const totalOrders = points.reduce((s, p) => s + p.orders, 0)
  const hourData = Array.from({ length: 15 }, (_, i) => i + 7).map((h) => ({
    label: `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`,
    value: hours.find((x) => x.hour === h)?.orders ?? 0,
  }))

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${RANGES[g].label} view · last ${RANGES[g].days} days · campus time (${env.timezone})`}
        action={
          <>
            <a href={`/api/staff/export?type=orders&days=${RANGES[g].days}`} className={buttonClasses('secondary')}>
              <Download className="h-4 w-4" /> Orders CSV
            </a>
            <a href={`/api/staff/export?type=payments&days=${RANGES[g].days}`} className={buttonClasses('secondary')}>
              <Download className="h-4 w-4" /> Payments CSV
            </a>
          </>
        }
      />

      <div className="mb-6 inline-flex rounded-xl border border-line bg-surface p-1 shadow-card" role="tablist">
        {(Object.keys(RANGES) as Granularity[]).map((key) => (
          <Link
            key={key}
            href={`?view=${key}`}
            role="tab"
            aria-selected={g === key}
            className={cn('rounded-lg px-4 py-2 text-sm font-semibold', g === key ? 'bg-primary text-white' : 'text-ink/80 hover:text-primary')}
          >
            {RANGES[key].label}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Revenue" value={formatINR(totalRevenue)} icon={IndianRupee} tone="primary" />
        <StatCard label="Paid orders" value={totalOrders} icon={ReceiptText} tone="info" />
        <StatCard label="Average order" value={formatINR(totalOrders ? Math.round(totalRevenue / totalOrders) : 0)} icon={ShoppingBag} tone="accent" />
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader title={`${RANGES[g].label} revenue`} />
          <CardBody>
            {points.length ? (
              <BarChart label={`${RANGES[g].label} revenue`} data={points.map((p) => ({ label: bucketLabel(p.bucket, g), value: p.revenuePaise, sublabel: `${bucketLabel(p.bucket, g)} · ${p.orders} orders` }))} format={formatINR} />
            ) : (
              <p className="text-sm text-muted">No sales in this period.</p>
            )}
          </CardBody>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Order volume by hour" description="When students order — plan staffing around peaks." />
            <CardBody>
              <BarChart label="Orders by hour of day" data={hourData} format={(v) => `${v} orders`} highlightLast={false} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Most ordered food" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-subtle">
                    <th className="px-6 py-3 font-medium">Item</th>
                    <th className="px-3 py-3 text-right font-medium">Qty</th>
                    <th className="px-6 py-3 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((i) => (
                    <tr key={i.foodItemId}>
                      <td className="px-6 py-3 font-medium">{i.name}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{i.quantity}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{formatINR(i.revenuePaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
