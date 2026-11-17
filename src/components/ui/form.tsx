import { forwardRef, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

const control =
  'block w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink sm:text-[15px] placeholder:text-muted/80 ' +
  'shadow-[inset_0_1px_1px_rgb(23_63_53/0.03)] transition-colors ' +
  'hover:border-primary/25 focus:border-accent focus:outline-none focus:shadow-[var(--shadow-focus)] ' +
  'disabled:cursor-not-allowed disabled:bg-bg disabled:opacity-70 aria-[invalid=true]:border-danger'

export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-11', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(control, 'min-h-24 py-2.5', className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, ComponentProps<'select'>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn(control, 'h-11 pr-8', className)} {...props} />
})

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-ink', className)} {...props} />
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  htmlFor: string
  hint?: ReactNode
  error?: string | string[]
  children: ReactNode
  className?: string
}) {
  const message = Array.isArray(error) ? error[0] : error
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {message ? (
        <p className="mt-1.5 text-sm text-danger-ink" role="alert">
          {message}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function Checkbox({ label, className, ...props }: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 text-sm text-ink', className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4.5 w-4.5 shrink-0 cursor-pointer rounded border-line accent-[var(--color-primary)]"
        {...props}
      />
      <span>{label}</span>
    </label>
  )
}
