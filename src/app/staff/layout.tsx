import { db } from '@/lib/db'
import { requirePortalUser } from '@/lib/auth/guards'
import { PortalShell, type NavItem } from '@/components/portal/portal-shell'
import { LiveUpdates } from '@/components/portal/live-updates'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser('STAFF')
  const profile = await db.staffProfile.findUnique({ where: { userId: user.id }, select: { title: true } })
  const p = (perm: string) => user.permissions.includes(perm)
  const accounts = p('CANTEEN_ACCOUNTS') ? '/staff/canteen' : p('STAFF_ACCOUNTS') ? '/staff/team' : null
  const settings = p('SETTINGS') ? '/staff/settings' : p('AUDIT') ? '/staff/audit' : null
  const nav: NavItem[] = [
    { href: '/staff/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/staff/orders', label: 'Orders', icon: 'orders' },
    ...(p('USERS') ? [{ href: '/staff/users', label: 'Users', icon: 'users' } as const] : []),
    ...(p('FOOD') ? [{ href: '/staff/food', label: 'Menu', icon: 'food' } as const] : []),
    ...(p('PAYMENTS') ? [{ href: '/staff/payments', label: 'Payments', icon: 'payments' } as const] : []),
    ...(p('REPORTS') ? [{ href: '/staff/reports', label: 'Reports', icon: 'reports' } as const] : []),
    ...(accounts ? [{ href: accounts, label: 'Accounts', icon: 'team' } as const] : []),
    ...(settings ? [{ href: settings, label: 'Settings', icon: 'settings' } as const] : []),
  ]
  return (
    <PortalShell portalLabel="Staff & Admin" nav={nav} user={{ name: user.name, subtitle: profile?.title ?? 'Staff' }} topRight={<LiveUpdates />}>
      {children}
    </PortalShell>
  )
}
