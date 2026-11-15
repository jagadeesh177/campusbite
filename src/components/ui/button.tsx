import Link from 'next/link'
import { forwardRef, type ComponentProps } from 'react'
import { cn } from '@/lib/cn'

const VARIANTS = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-hover active:translate-y-px',
  secondary: 'bg-surface text-ink border border-line shadow-sm hover:border-primary/30 hover:bg-primary-soft/60',
  ghost: 'text-ink hover:bg-primary-soft',
  soft: 'bg-accent-soft text-accent-ink hover:bg-accent/15',
  danger: 'bg-danger text-white shadow-sm hover:brightness-95 active:translate-y-px',
  success: 'bg-success text-white shadow-sm hover:brightness-95 active:translate-y-px',
  'danger-ghost': 'text-danger-ink hover:bg-danger-soft',
} as const

const SIZES = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
  xl: 'h-14 px-6 text-base gap-2.5 rounded-2xl',
  icon: 'h-10 w-10 rounded-xl',
  'icon-lg': 'h-12 w-12 rounded-xl',
} as const

export type ButtonVariant = keyof typeof VARIANTS
export type ButtonSize = keyof typeof SIZES

const base =
  'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors duration-150 [&_svg]:shrink-0 ' +
  'disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]'

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(base, VARIANTS[variant], SIZES[size], className)
}

export const Button = forwardRef<
  HTMLButtonElement,
  ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={buttonClasses(variant, size, className)} {...props} />
})

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />
}
