import Link from 'next/link'
import { cn } from '@/lib/cn'

/** Two related staff pages shown as one section with tabs (e.g. Accounts, Settings). */
export function SectionTabs({ tabs, active }: { tabs: { href: string; label: string; show: boolean }[]; active: string }) {
  const visible = tabs.filter((t) => t.show)
  if (visible.length < 2) return null
  return (
    <nav className="mb-5 inline-flex rounded-xl border border-line bg-surface p-1 shadow-card" aria-label="Section">
      {visible.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? 'page' : undefined}
          className={cn('rounded-lg px-4 py-2 text-sm font-semibold', t.href === active ? 'bg-primary text-white' : 'text-ink/80 hover:text-primary')}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

export const accountTabs = (perms: string[]) => [
  { href: '/staff/canteen', label: 'Canteen accounts', show: perms.includes('CANTEEN_ACCOUNTS') },
  { href: '/staff/team', label: 'Staff accounts', show: perms.includes('STAFF_ACCOUNTS') },
]

export const settingsTabs = (perms: string[]) => [
  { href: '/staff/settings', label: 'Kitchen', show: perms.includes('SETTINGS') },
  { href: '/staff/audit', label: 'Activity log', show: perms.includes('AUDIT') },
]
