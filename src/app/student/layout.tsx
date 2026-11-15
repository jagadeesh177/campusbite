import { requirePortalUser } from '@/lib/auth/guards'
import { CartProvider } from '@/components/portal/cart-context'
import { PortalShell, type NavItem } from '@/components/portal/portal-shell'
import { LiveUpdates } from '@/components/portal/live-updates'

const NAV: NavItem[] = [
  { href: '/student/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/student/menu', label: 'Food Menu', icon: 'menu' },
  { href: '/student/cart', label: 'My Cart', icon: 'cart' },
  { href: '/student/orders', label: 'My Orders', icon: 'orders' },
  { href: '/student/history', label: 'Order History', icon: 'history' },
  { href: '/student/profile', label: 'Profile', icon: 'profile' },
]

const BOTTOM: NavItem[] = [
  { href: '/student/dashboard', label: 'Home', icon: 'dashboard' },
  { href: '/student/menu', label: 'Menu', icon: 'menu' },
  { href: '/student/cart', label: 'Cart', icon: 'cart' },
  { href: '/student/orders', label: 'Orders', icon: 'orders' },
  { href: '/student/profile', label: 'Profile', icon: 'profile' },
]

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser('STUDENT')
  return (
    <CartProvider userId={user.id}>
      <PortalShell
        portalLabel="Student"
        nav={NAV}
        bottomNav={BOTTOM}
        user={{ name: user.name, subtitle: user.student?.externalStudentId ?? user.email }}
        topRight={<LiveUpdates />}
      >
        {children}
      </PortalShell>
    </CartProvider>
  )
}
