// Order lifecycle rules (pure). Every status change in the app goes through
// canTransition(); the database update additionally uses a compare-and-set
// on the current status so concurrent changes can't skip steps.

import type { OrderStatusValue } from '@/lib/order-status'

export type ActorKind = 'USER' | 'CANTEEN' | 'STAFF' | 'SYSTEM'

type Rules = Record<OrderStatusValue, Partial<Record<OrderStatusValue, ActorKind[]>>>

const RULES: Rules = {
  PAYMENT_PENDING: {
    CONFIRMED: ['SYSTEM'], // only a verified payment confirms an order
    CANCELLED: ['USER', 'STAFF', 'SYSTEM'],
  },
  CONFIRMED: {
    ACCEPTED: ['CANTEEN'],
    REFUND_PENDING: ['CANTEEN', 'USER', 'STAFF', 'SYSTEM'],
  },
  ACCEPTED: {
    PREPARING: ['CANTEEN'],
    REFUND_PENDING: ['CANTEEN', 'STAFF'],
  },
  PREPARING: {
    READY: ['CANTEEN'],
    REFUND_PENDING: ['STAFF'],
  },
  READY: {
    COLLECTED: ['CANTEEN'], // only via pickup-token verification
    REFUND_PENDING: ['STAFF'],
  },
  COLLECTED: {},
  CANCELLED: {
    // A payment that lands after the order expired must be refunded.
    REFUND_PENDING: ['SYSTEM'],
  },
  REFUND_PENDING: {
    REFUNDED: ['SYSTEM', 'STAFF'],
  },
  REFUNDED: {},
}

export function canTransition(
  from: OrderStatusValue,
  to: OrderStatusValue,
  actor: ActorKind,
): boolean {
  return RULES[from]?.[to]?.includes(actor) ?? false
}

export function allowedTransitions(from: OrderStatusValue, actor: ActorKind): OrderStatusValue[] {
  return (Object.entries(RULES[from] ?? {}) as [OrderStatusValue, ActorKind[]][])
    .filter(([, actors]) => actors.includes(actor))
    .map(([to]) => to)
}
