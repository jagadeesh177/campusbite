import type { ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Logo } from '@/components/ui/logo'

export function AuthShell({
  title,
  subtitle,
  children,
  aside,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  aside?: { heading: string; points: string[] }
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-primary p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-accent/25 blur-3xl"
          aria-hidden
        />
        <div className="relative [&_a_span]:!text-white">
          <Logo />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight">{aside?.heading ?? 'Skip the queue. Enjoy your break.'}</h2>
          <ul className="mt-6 space-y-3 text-white/85">
            {(aside?.points ?? ['Order from anywhere on campus', 'Pay securely with UPI', 'Track your order live']).map((p) => (
              <li key={p} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-accent" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">CampusBite · College canteen pre-ordering</p>
      </div>

      <div className="flex flex-col px-4 py-8 sm:px-8">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
          {subtitle && <div className="mt-2 text-[15px] text-muted">{subtitle}</div>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  )
}
