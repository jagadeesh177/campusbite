import { requirePortalUser } from '@/lib/auth/guards'
import { db } from '@/lib/db'
import { PortalShell, type NavItem } from '@/components/portal/portal-shell'
import { LiveUpdates } from '@/components/portal/live-updates'

export default async function CanteenLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser('CANTEEN')
  const profile = await db.canteenProfile.findUnique({ where: { userId: user.id }, select: { counterName: true } })
  // Busy-hours first: orders, pickup check, history, menu
  const nav: NavItem[] = [
    ...(user.permissions.includes('ORDERS')
      ? ([
          { href: '/canteen/dashboard', label: 'Orders', icon: 'dashboard' },
          { href: '/canteen/pickup', label: 'Verify pickup', icon: 'pickup' },
          { href: '/canteen/history', label: 'History', icon: 'history' },
        ] as const)
      : []),
    ...(user.permissions.includes('MENU') ? ([{ href: '/canteen/menu', label: 'Menu', icon: 'food' }] as const) : []),
  ]
  return (
    <PortalShell
      portalLabel="Canteen"
      nav={nav}
      user={{ name: user.name, subtitle: profile?.counterName ?? 'Canteen' }}
      topRight={<LiveUpdates />}
    >
      {children}
    </PortalShell>
  )
}
