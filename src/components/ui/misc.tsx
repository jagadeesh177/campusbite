import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm font-medium text-accent-ink">{eyebrow}</div>}
        <h1 className="text-2xl font-bold text-ink sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

const NOTICE = {
  info: { cls: 'border-info/20 bg-info-soft text-info-ink', Icon: Info },
  success: { cls: 'border-success/20 bg-success-soft text-success', Icon: CheckCircle2 },
  warning: { cls: 'border-warning/30 bg-warning-soft text-warning-ink', Icon: AlertTriangle },
  danger: { cls: 'border-danger/20 bg-danger-soft text-danger-ink', Icon: XCircle },
} as const

export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof NOTICE
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const { cls, Icon } = NOTICE[tone]
  return (
    <div className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', cls, className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn(title ? 'mt-0.5' : null, 'opacity-95')}>{children}</div>}
      </div>
    </div>
  )
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = 'primary',
}: {
  label: string
  value: ReactNode
  icon: LucideIcon
  hint?: ReactNode
  tone?: 'primary' | 'accent' | 'warning' | 'success' | 'danger' | 'info'
}) {
  const tones = {
    primary: 'bg-primary-soft text-primary',
    accent: 'bg-accent-soft text-accent-ink',
    warning: 'bg-warning-soft text-warning-ink',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger-ink',
    info: 'bg-info-soft text-info-ink',
  }
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-muted">{label}</div>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tones[tone])}>
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </div>
      </div>
      <div className="mt-2 font-display text-2xl font-bold text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-sm text-muted">{hint}</div>}
    </div>
  )
}

/* eslint-disable @next/next/no-img-element */
export function FoodImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return (
    <div className={cn('overflow-hidden bg-accent-soft', className)}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-3xl" aria-hidden>
          🍽️
        </div>
      )}
    </div>
  )
}
