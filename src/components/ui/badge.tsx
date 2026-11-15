import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import {
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  type OrderStatusValue,
} from '@/lib/order-status'

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'violet'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[#EEF2EF] text-subtle',
  primary: 'bg-primary-soft text-primary',
  accent: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
  violet: 'bg-violet-soft text-violet-ink',
}

const DOTS: Record<BadgeTone, string> = {
  neutral: 'bg-muted',
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  violet: 'bg-violet',
}

export function Badge({
  tone = 'neutral',
  dot,
  children,
  className,
}: {
  tone?: BadgeTone
  dot?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} aria-hidden />}
      {children}
    </span>
  )
}

/** One distinct colour per order status. */
export const STATUS_TONE: Record<OrderStatusValue, BadgeTone> = {
  PAYMENT_PENDING: 'warning',
  CONFIRMED: 'info',
  ACCEPTED: 'primary',
  PREPARING: 'accent',
  READY: 'success',
  COLLECTED: 'neutral',
  CANCELLED: 'danger',
  REFUND_PENDING: 'violet',
  REFUNDED: 'neutral',
}

export function OrderStatusBadge({ status, className }: { status: OrderStatusValue; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot className={className}>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  )
}

const PAYMENT_TONE: Record<string, BadgeTone> = {
  CREATED: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  REFUNDED: 'violet',
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={PAYMENT_TONE[status] ?? 'neutral'}>{PAYMENT_STATUS_LABEL[status] ?? status}</Badge>
  )
}

export function VegMark({ isVeg, className }: { isVeg: boolean; className?: string }) {
  return (
    <span
      title={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
      aria-label={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-white',
        isVeg ? 'border-success' : 'border-danger',
        className,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', isVeg ? 'bg-success' : 'bg-danger')} />
    </span>
  )
}
