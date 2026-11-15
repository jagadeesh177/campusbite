import 'server-only'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { rupeesToPaise } from '@/lib/money'
import { startOfZonedDay } from '@/lib/time'
import { expireStalePendingOrders } from '@/lib/orders/expire'
import type { OrderStatusValue } from '@/lib/order-status'

export interface BoardOrder {
  id: string
  orderNumber: string
  status: OrderStatusValue
  studentName: string
  studentId: string | null
  items: { name: string; quantity: number }[]
  totalPaise: number
  paymentVerified: boolean
  pickupToken: string | null
  createdAt: string
  pickupSlotStart: string | null
  estimatedReadyAt: string | null
  cancelReason: string | null
}

export async function getKitchenBoard() {
  await expireStalePendingOrders()
  const todayStart = startOfZonedDay(new Date(), env.timezone)

  const rows = await db.order.findMany({
    where: {
      OR: [
        { status: { in: ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY'] } },
        { status: 'COLLECTED', collectedAt: { gte: todayStart } },
        { status: { in: ['REFUND_PENDING', 'REFUNDED'] }, confirmedAt: { gte: todayStart } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    include: {
      items: true,
      user: { select: { name: true, studentProfile: { select: { externalStudentId: true } } } },
      payments: { where: { status: { in: ['SUCCEEDED', 'REFUNDED'] } }, take: 1 },
      pickupToken: true,
    },
    take: 300,
  })

  const orders: BoardOrder[] = rows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    studentName: o.user.name,
    studentId: o.user.studentProfile?.externalStudentId ?? null,
    items: o.items.map((i) => ({ name: i.nameSnapshot, quantity: i.quantity })),
    totalPaise: rupeesToPaise(o.total),
    paymentVerified: o.payments.length > 0,
    pickupToken: o.pickupToken?.token ?? null,
    createdAt: o.createdAt.toISOString(),
    pickupSlotStart: o.pickupSlotStart?.toISOString() ?? null,
    estimatedReadyAt: o.estimatedReadyAt?.toISOString() ?? null,
    cancelReason: o.cancelReason,
  }))

  const sales = await db.order.aggregate({
    where: {
      confirmedAt: { gte: todayStart },
      status: { in: ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED'] },
    },
    _sum: { total: true },
  })

  return {
    orders,
    stats: {
      newOrders: orders.filter((o) => o.status === 'CONFIRMED').length,
      preparing: orders.filter((o) => o.status === 'ACCEPTED' || o.status === 'PREPARING').length,
      ready: orders.filter((o) => o.status === 'READY').length,
      completedToday: orders.filter((o) => o.status === 'COLLECTED').length,
      salesTodayPaise: rupeesToPaise(sales._sum.total ?? 0),
    },
  }
}
