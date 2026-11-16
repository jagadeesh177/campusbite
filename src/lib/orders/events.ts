import 'server-only'
import type { Prisma } from '@prisma/client'
import type { OrderStatusValue } from '@/lib/order-status'
import { notifyUser, publishEvent } from '@/lib/realtime/publish'
import type { ActorKind } from './state-machine'

const STUDENT_MESSAGE: Partial<
  Record<OrderStatusValue, (orderNumber: string, note?: string | null) => { title: string; body: string }>
> = {
  CONFIRMED: (n) => ({ title: 'Payment received', body: `Order ${n} is confirmed and sent to the canteen.` }),
  ACCEPTED: (n) => ({ title: 'Order accepted', body: `The canteen has accepted order ${n}.` }),
  PREPARING: (n) => ({ title: 'Being prepared', body: `Your food for ${n} is being prepared.` }),
  READY: (n) => ({ title: 'Ready for pickup!', body: `Order ${n} is ready. Show your pickup token at the counter.` }),
  COLLECTED: (n) => ({ title: 'Order collected', body: `Enjoy your meal! Order ${n} has been collected.` }),
  CANCELLED: (n, note) => ({ title: 'Order cancelled', body: `Order ${n} was cancelled${note ? `: ${note}` : '.'}` }),
  REFUND_PENDING: (n, note) => ({
    title: 'Refund initiated',
    body: `A refund for ${n} has been initiated${note ? ` (${note})` : ''}. It usually reaches your account in 5–7 working days.`,
  }),
  REFUNDED: (n) => ({ title: 'Refund completed', body: `The refund for order ${n} has been processed.` }),
}

export async function recordStatusChange(
  tx: Prisma.TransactionClient,
  p: {
    order: { id: string; orderNumber: string; userId: string }
    from: OrderStatusValue | null
    to: OrderStatusValue
    actorKind: ActorKind
    actorUserId?: string | null
    note?: string | null
  },
) {
  await tx.orderStatusHistory.create({
    data: {
      orderId: p.order.id,
      fromStatus: p.from,
      toStatus: p.to,
      actorRole: p.actorKind,
      changedById: p.actorUserId ?? null,
      note: p.note ?? null,
    },
  })

  const msg = STUDENT_MESSAGE[p.to]?.(p.order.orderNumber, p.note)
  if (msg) {
    await notifyUser(tx, {
      userId: p.order.userId,
      orderId: p.order.id,
      type: `ORDER_${p.to}`,
      ...msg,
    })
  }

  await publishEvent(tx, {
    type: p.from === 'PAYMENT_PENDING' && p.to === 'CONFIRMED' ? 'ORDER_CREATED' : 'ORDER_STATUS_CHANGED',
    orderId: p.order.id,
    forUserId: p.order.userId,
    // The kitchen doesn't care about unpaid carts
    forCanteen: p.to !== 'PAYMENT_PENDING' && !(p.from === 'PAYMENT_PENDING' && p.to === 'CANCELLED'),
    forStaff: true,
    payload: { orderNumber: p.order.orderNumber, from: p.from, to: p.to },
  })
}
