// Shared, client-safe order/payment status metadata.

export const ORDER_STATUSES = [
  'PAYMENT_PENDING',
  'CONFIRMED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'COLLECTED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
] as const

export type OrderStatusValue = (typeof ORDER_STATUSES)[number]

export const ORDER_STATUS_LABEL: Record<OrderStatusValue, string> = {
  PAYMENT_PENDING: 'Payment pending',
  CONFIRMED: 'Confirmed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready for pickup',
  COLLECTED: 'Collected',
  CANCELLED: 'Cancelled',
  REFUND_PENDING: 'Refund in progress',
  REFUNDED: 'Refunded',
}

export const ACTIVE_ORDER_STATUSES: OrderStatusValue[] = [
  'PAYMENT_PENDING',
  'CONFIRMED',
  'ACCEPTED',
  'PREPARING',
  'READY',
]

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Awaiting payment',
  SUCCEEDED: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refund sent', // Razorpay sent it back; bank credit is confirmed separately
}
