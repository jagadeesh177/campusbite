import 'server-only'
import QRCode from 'qrcode'
import { db } from '@/lib/db'
import { rupeesToPaise } from '@/lib/money'
import { ACTIVE_ORDER_STATUSES } from '@/lib/order-status'
import { buildPickupQrPayload } from '@/lib/orders/codes'
import { allowedTransitions } from '@/lib/orders/state-machine'

export type MenuItemView = {
  id: string
  name: string
  description: string
  pricePaise: number
  imageUrl: string | null
  isVeg: boolean
  isAvailable: boolean
  isPopular: boolean
  prepTimeMinutes: number
  categoryId: string
  categoryName: string
}

export async function getMenu() {
  const categories = await db.foodCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { items: { orderBy: [{ isAvailable: 'desc' }, { name: 'asc' }] } },
  })
  const items: MenuItemView[] = categories.flatMap((c) =>
    c.items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      pricePaise: rupeesToPaise(i.price),
      imageUrl: i.imageUrl,
      isVeg: i.isVeg,
      isAvailable: i.isAvailable,
      isPopular: i.isPopular,
      prepTimeMinutes: i.prepTimeMinutes,
      categoryId: c.id,
      categoryName: c.name,
    })),
  )
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c.items.filter((i) => i.isAvailable).length })),
    items,
  }
}

const orderInclude = {
  items: true,
  payments: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  pickupToken: true,
  refunds: { orderBy: { createdAt: 'desc' as const }, take: 1 },
}

function toOrderView<T extends Awaited<ReturnType<typeof loadOrders>>[number]>(o: T) {
  const payment = o.payments[0] ?? null
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt,
    estimatedReadyAt: o.estimatedReadyAt,
    pickupSlotStart: o.pickupSlotStart,
    cancelReason: o.cancelReason,
    totalPaise: rupeesToPaise(o.total),
    subtotalPaise: rupeesToPaise(o.subtotal),
    feesPaise: rupeesToPaise(o.fees),
    items: o.items.map((i) => ({ id: i.id, name: i.nameSnapshot, quantity: i.quantity, lineTotalPaise: rupeesToPaise(i.lineTotal) })),
    payment: payment
      ? { id: payment.id, status: payment.status, provider: payment.provider, method: payment.method, reference: payment.gatewayPaymentId }
      : null,
    pickupToken: o.pickupToken?.token ?? null,
    refund: o.refunds[0] ? { status: o.refunds[0].status, amountPaise: rupeesToPaise(o.refunds[0].amount) } : null,
    canCancel: allowedTransitions(o.status, 'USER').length > 0,
  }
}

function loadOrders(userId: string, where: object, take = 50, skip = 0) {
  return db.order.findMany({
    where: { userId, ...where },
    orderBy: { createdAt: 'desc' },
    include: orderInclude,
    take,
    skip,
  })
}

export type UserOrderView = ReturnType<typeof toOrderView>

export async function getActiveOrders(userId: string) {
  const rows = await loadOrders(userId, { status: { in: ACTIVE_ORDER_STATUSES } })
  return rows.map(toOrderView)
}

export async function getOrderHistory(userId: string, page: number, pageSize = 10) {
  const past = ['COLLECTED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED'] as const
  const [rows, total] = await Promise.all([
    loadOrders(userId, { status: { in: [...past] } }, pageSize, (page - 1) * pageSize),
    db.order.count({ where: { userId, status: { in: [...past] } } }),
  ])
  return { orders: rows.map(toOrderView), total, pages: Math.max(1, Math.ceil(total / pageSize)) }
}

/** Scoped to the owner — another user's order id returns null (no IDOR). */
export async function getUserOrder(userId: string, orderId: string) {
  const o = await db.order.findFirst({
    where: { id: orderId, userId },
    include: { ...orderInclude, history: { orderBy: { createdAt: 'asc' } } },
  })
  if (!o) return null
  const view = toOrderView(o)
  const qrSvg = view.pickupToken
    ? await QRCode.toString(buildPickupQrPayload(o.orderNumber, view.pickupToken), {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#173F35', light: '#FFFFFF' },
      })
    : null
  return {
    ...view,
    qrSvg,
    history: o.history.map((h) => ({ id: h.id, toStatus: h.toStatus, note: h.note, createdAt: h.createdAt })),
  }
}

/** Items the user orders most, excluding sold-out ones. */
export async function getRecommendations(userId: string, limit = 4) {
  const top = await db.orderItem.groupBy({
    by: ['foodItemId'],
    where: { order: { userId, status: 'COLLECTED' } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 8,
  })
  const ids = top.map((t) => t.foodItemId)
  const items = await db.foodItem.findMany({
    where: { id: { in: ids }, isAvailable: true, category: { isActive: true } },
    include: { category: true },
  })
  const ordered = ids.map((id) => items.find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i)
  return ordered.slice(0, limit)
}

export async function getUnreadNotifications(userId: string) {
  return db.notification.findMany({
    where: { userId, readAt: null },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
}
