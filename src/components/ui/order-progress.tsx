import { Check, ChefHat, CircleDollarSign, PackageCheck, ShoppingBag, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { OrderStatusValue } from '@/lib/order-status'

const STEPS = [
  { status: 'CONFIRMED', label: 'Paid', Icon: CircleDollarSign },
  { status: 'ACCEPTED', label: 'Accepted', Icon: ThumbsUp },
  { status: 'PREPARING', label: 'Preparing', Icon: ChefHat },
  { status: 'READY', label: 'Ready', Icon: PackageCheck },
  { status: 'COLLECTED', label: 'Collected', Icon: ShoppingBag },
] as const

const RANK: Partial<Record<OrderStatusValue, number>> = {
  PAYMENT_PENDING: -1,
  CONFIRMED: 0,
  ACCEPTED: 1,
  PREPARING: 2,
  READY: 3,
  COLLECTED: 4,
}

/** Visual tracker for the happy path. Off-path statuses render a note instead. */
export function OrderProgress({ status, compact }: { status: OrderStatusValue; compact?: boolean }) {
  const rank = RANK[status]
  if (rank === undefined) return null
  return (
    <ol className="flex items-start" aria-label="Order progress">
      {STEPS.map((step, i) => {
        const done = i < rank || (i === rank && status === 'COLLECTED')
        const current = i === rank && status !== 'COLLECTED'
        return (
          <li key={step.status} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                className={cn(
                  'absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2',
                  i <= rank ? 'bg-accent' : 'bg-line',
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors',
                done && 'border-accent bg-accent text-white',
                current && 'border-accent bg-surface text-accent-ink shadow-[0_0_0_4px_rgb(40_168_121/0.15)]',
                !done && !current && 'border-line bg-surface text-muted',
              )}
            >
              {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <step.Icon className={cn('h-4 w-4', current && 'cb-pulse')} />}
            </span>
            {!compact && (
              <span
                className={cn(
                  'mt-2 text-xs font-medium',
                  current ? 'text-accent-ink' : done ? 'text-ink' : 'text-subtle',
                )}
              >
                {step.label}
              </span>
            )}
            <span className="sr-only">{done ? 'completed' : current ? 'in progress' : 'not started'}</span>
          </li>
        )
      })}
    </ol>
  )
}
