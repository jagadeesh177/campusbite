import Link from 'next/link'
import { cn } from '@/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-9 w-9', className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--color-primary)" />
      <path d="M18 34a14 14 0 0 0 28 0z" fill="var(--color-accent)" />
      <path d="M16 34h32" stroke="#F8FAF7" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M27 18c0 3-3 4-3 7M34 16c0 3-3 4-3 7M41 18c0 3-3 4-3 7"
        stroke="#F8FAF7"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export function Logo({ href = '/', className, subtitle }: { href?: string; className?: string; subtitle?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5', className)} aria-label="CampusBite home">
      <LogoMark />
      <span className="leading-none">
        <span className="block font-display text-lg font-bold text-primary">
          Campus<span className="text-accent">Bite</span>
        </span>
        {subtitle && <span className="mt-1 block text-xs font-medium text-subtle">{subtitle}</span>}
      </span>
    </Link>
  )
}
