import { db } from '@/lib/db'
import { requirePortalUser } from '@/lib/auth/guards'
import { PortalShell, type NavItem } from '@/components/portal/portal-shell'
import { LiveUpdates } from '@/components/portal/live-updates'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser('STAFF')
  const profile = await db.staffProfile.findUnique({ where: { userId: user.id }, select: { title: true } })
  const p = (perm: string) => user.permissions.includes(perm)
  const nav: NavItem[] = [
    { href: '/staff/dashboard', label: 'Dashboard', icon: 'dashboard' },
    ...(p('STUDENTS') ? [{ href: '/staff/students', label: 'Students', icon: 'students' } as const] : []),
    ...(p('CANTEEN_ACCOUNTS') ? [{ href: '/staff/canteen', label: 'Canteen', icon: 'canteen' } as const] : []),
    ...(p('FOOD') ? [{ href: '/staff/food', label: 'Food & menu', icon: 'food' } as const] : []),
    ...(p('PAYMENTS') ? [{ href: '/staff/payments', label: 'Payments', icon: 'payments' } as const] : []),
    ...(p('REPORTS') ? [{ href: '/staff/reports', label: 'Reports', icon: 'reports' } as const] : []),
    ...(p('STAFF_ACCOUNTS') ? [{ href: '/staff/team', label: 'Staff accounts', icon: 'team' } as const] : []),
    ...(p('AUDIT') ? [{ href: '/staff/audit', label: 'Audit log', icon: 'audit' } as const] : []),
    ...(p('SETTINGS') ? [{ href: '/staff/settings', label: 'Kitchen settings', icon: 'settings' } as const] : []),
  ]
  return (
    <PortalShell portalLabel="Staff & Admin" nav={nav} user={{ name: user.name, subtitle: profile?.title ?? 'Staff' }} topRight={<LiveUpdates />}>
      {children}
    </PortalShell>
  )
}
