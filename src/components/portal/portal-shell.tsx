'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  BarChart3,
  ChefHat,
  ClipboardList,
  CreditCard,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  ScrollText,
  Settings,
  ShoppingCart,
  Store,
  User,
  UserCog,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { logoutAction } from '@/app/actions/auth'
import { Logo } from '@/components/ui/logo'
import { cn } from '@/lib/cn'
import { useCart } from './cart-context'

const ICONS = {
  dashboard: LayoutDashboard,
  menu: UtensilsCrossed,
  cart: ShoppingCart,
  orders: ClipboardList,
  history: History,
  profile: User,
  pickup: QrCode,
  settings: Settings,
  users: Users,
  canteen: Store,
  team: UserCog,
  food: ChefHat,
  payments: CreditCard,
  reports: BarChart3,
  audit: ScrollText,
} as const

export type NavIcon = keyof typeof ICONS

export interface NavItem {
  href: string
  label: string
  icon: NavIcon
}

function CartCount() {
  const { count } = useCart()
  if (!count) return null
  return (
    <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-white tabular-nums">{count}</span>
  )
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon]
        const active = pathname === item.href || (item.href.split('/').length > 2 && pathname.startsWith(`${item.href}/`))
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors',
                active ? 'bg-primary text-white shadow-sm' : 'text-ink/80 hover:bg-primary-soft hover:text-primary',
              )}
            >
              <Icon className={cn('h-5 w-5', active ? 'text-accent' : 'text-muted')} aria-hidden />
              {item.label}
              {item.icon === 'cart' && <CartCount />}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function UserFooter({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <div className="border-t border-line p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">
          {name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{name}</div>
          <div className="truncate text-xs text-subtle">{subtitle}</div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger-ink"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
        </form>
      </div>
    </div>
  )
}

export function PortalShell({
  portalLabel,
  nav,
  bottomNav,
  user,
  children,
  topRight,
}: {
  portalLabel: string
  nav: NavItem[]
  bottomNav?: NavItem[]
  user: { name: string; subtitle: string }
  children: ReactNode
  topRight?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 py-5">
          <Logo href={nav[0]?.href ?? '/'} subtitle={portalLabel} />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label={`${portalLabel} navigation`}>
          <NavLinks items={nav} />
        </nav>
        <UserFooter {...user} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Logo href={nav[0]?.href ?? '/'} subtitle={portalLabel} />
        <div className="flex items-center gap-2">
          {topRight}
          <button
            className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-primary-soft"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={open}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-primary/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(86vw,320px)] flex-col bg-surface shadow-lift">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="font-display font-bold text-primary">{portalLabel}</span>
              <button className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-primary-soft" onClick={() => setOpen(false)} aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3">
              <NavLinks items={nav} onNavigate={() => setOpen(false)} />
            </nav>
            <UserFooter {...user} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <div className={cn('mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8', bottomNav && 'pb-28 lg:pb-8')}>
          {topRight && <div className="mb-4 hidden justify-end lg:flex">{topRight}</div>}
          {children}
        </div>
      </div>

      {/* Mobile bottom tabs (user) */}
      {bottomNav && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          aria-label="Quick navigation"
        >
          <ul className="grid grid-cols-5">
            {bottomNav.map((item) => {
              const Icon = ICONS[item.icon]
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold', active ? 'text-primary' : 'text-subtle')}
                  >
                    {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" aria-hidden />}
                    <span className="relative">
                      <Icon className={cn('h-5.5 w-5.5', active && 'text-primary')} aria-hidden />
                      {item.icon === 'cart' && <BottomCartDot />}
                    </span>
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </div>
  )
}

function BottomCartDot() {
  const { count } = useCart()
  if (!count) return null
  return (
    <span className="absolute -top-1.5 -right-2.5 min-w-4.5 rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-4.5 text-white">
      {count}
    </span>
  )
}
