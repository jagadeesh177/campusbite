import 'server-only'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { rupeesToPaise } from '@/lib/money'
import { startOfZonedDay } from '@/lib/time'

/** Orders whose money was kept (excludes cancelled & refunded). */
export const REVENUE_STATUSES = ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED'] as const
const REVENUE_SQL = Prisma.sql`ARRAY['CONFIRMED','ACCEPTED','PREPARING','READY','COLLECTED']::"OrderStatus"[]`

export type Granularity = 'day' | 'week' | 'month'

export interface SeriesPoint {
  bucket: string // YYYY-MM-DD (campus-local start of bucket)
  orders: number
  revenuePaise: number
}

export async function salesSeries(granularity: Granularity, since: Date): Promise<SeriesPoint[]> {
  const tz = env.timezone
  const rows = await db.$queryRaw<{ bucket: Date; orders: number; revenue: string | null }[]>`
    SELECT date_trunc(${granularity}, ("confirmedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}) AS bucket,
           count(*)::int AS orders,
           sum("total")::text AS revenue
    FROM "Order"
    WHERE "confirmedAt" >= ${since} AND "status" = ANY(${REVENUE_SQL})
    GROUP BY 1 ORDER BY 1`
  return rows.map((r) => ({
    bucket: r.bucket.toISOString().slice(0, 10),
    orders: r.orders,
    revenuePaise: r.revenue ? rupeesToPaise(r.revenue) : 0,
  }))
}

/** Fills empty days so charts show gaps as zero. */
export function fillDays(points: SeriesPoint[], days: number, today: Date): SeriesPoint[] {
  const byKey = new Map(points.map((p) => [p.bucket, p]))
  const out: SeriesPoint[] = []
  const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone }).format(today)
  const base = new Date(`${localToday}T00:00:00Z`)
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(base.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    out.push(byKey.get(key) ?? { bucket: key, orders: 0, revenuePaise: 0 })
  }
  return out
}

export async function topItems(since: Date, take = 8) {
  const rows = await db.orderItem.groupBy({
    by: ['foodItemId', 'nameSnapshot'],
    where: { order: { confirmedAt: { gte: since }, status: { in: [...REVENUE_STATUSES] } } },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take,
  })
  return rows.map((r) => ({
    foodItemId: r.foodItemId,
    name: r.nameSnapshot,
    quantity: r._sum.quantity ?? 0,
    revenuePaise: rupeesToPaise(r._sum.lineTotal ?? 0),
  }))
}

export async function ordersByHour(since: Date) {
  const tz = env.timezone
  const rows = await db.$queryRaw<{ hour: number; orders: number }[]>`
    SELECT extract(hour FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::int AS hour, count(*)::int AS orders
    FROM "Order"
    WHERE "createdAt" >= ${since} AND "status" = ANY(${REVENUE_SQL})
    GROUP BY 1 ORDER BY 1`
  return rows
}

export async function staffDashboard() {
  const now = new Date()
  const todayStart = startOfZonedDay(now, env.timezone)
  const since14 = new Date(todayStart.getTime() - 13 * 86_400_000)
  const since30 = new Date(todayStart.getTime() - 29 * 86_400_000)

  const [users, ordersToday, revenueToday, pending, cancelledToday, completedToday, series, popular, pendingRefunds] = await Promise.all([
    db.user.count({ where: { role: 'USER', status: { not: 'PENDING_VERIFICATION' } } }),
    db.order.count({ where: { createdAt: { gte: todayStart }, status: { not: 'PAYMENT_PENDING' } } }),
    db.order.aggregate({ where: { confirmedAt: { gte: todayStart }, status: { in: [...REVENUE_STATUSES] } }, _sum: { total: true } }),
    db.order.count({ where: { status: { in: ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY'] } } }),
    db.order.count({ where: { cancelledAt: { gte: todayStart }, status: { in: ['CANCELLED', 'REFUND_PENDING', 'REFUNDED'] } } }),
    db.order.count({ where: { collectedAt: { gte: todayStart }, status: 'COLLECTED' } }),
    salesSeries('day', since14),
    topItems(since30, 5),
    db.refund.count({ where: { status: { in: ['NOT_REQUESTED', 'FAILED', 'REVERSED'] } } }),
  ])

  return {
    kpis: {
      users,
      ordersToday,
      revenueTodayPaise: rupeesToPaise(revenueToday._sum.total ?? 0),
      pending,
      cancelledToday,
      completedToday,
      pendingRefunds,
    },
    series: fillDays(series, 14, now),
    popular,
  }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvCell(v: unknown): string {
  let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v)
  // Neutralise spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export async function exportOrdersCsv(since: Date) {
  const orders = await db.order.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    include: {
      items: true,
      user: { select: { name: true, email: true, userProfile: { select: { externalStudentId: true } } } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    take: 20_000,
  })
  return toCsv(
    ['order_number', 'created_at', 'status', 'user_name', 'user_id', 'email', 'items', 'subtotal_inr', 'fees_inr', 'total_inr', 'payment_status', 'payment_provider', 'payment_reference'],
    orders.map((o) => [
      o.orderNumber,
      o.createdAt,
      o.status,
      o.user.name,
      o.user.userProfile?.externalStudentId ?? '',
      o.user.email,
      o.items.map((i) => `${i.nameSnapshot} x${i.quantity}`).join('; '),
      o.subtotal.toFixed(2),
      o.fees.toFixed(2),
      o.total.toFixed(2),
      o.payments[0]?.status ?? '',
      o.payments[0]?.provider ?? '',
      o.payments[0]?.gatewayPaymentId ?? '',
    ]),
  )
}

export async function exportPaymentsCsv(since: Date) {
  const payments = await db.payment.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    include: { order: { select: { orderNumber: true } }, refunds: true },
    take: 20_000,
  })
  return toCsv(
    ['created_at', 'order_number', 'provider', 'status', 'amount_inr', 'currency', 'gateway_order_id', 'gateway_payment_id', 'method', 'verified_via', 'refund_status', 'refund_amount_inr'],
    payments.map((p) => [
      p.createdAt,
      p.order.orderNumber,
      p.provider,
      p.status,
      p.amount.toFixed(2),
      p.currency,
      p.gatewayOrderId,
      p.gatewayPaymentId ?? '',
      p.method ?? '',
      p.verifiedVia ?? '',
      p.refunds[0]?.status ?? '',
      p.refunds[0]?.amount.toFixed(2) ?? '',
    ]),
  )
}
