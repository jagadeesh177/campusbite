import { requirePortalUser } from '@/lib/auth/guards'
import { CartProvider } from '@/components/portal/cart-context'
import { PortalShell, type NavItem } from '@/components/portal/portal-shell'
import { LiveUpdates } from '@/components/portal/live-updates'

const NAV: NavItem[] = [
  { href: '/user/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/user/menu', label: 'Food Menu', icon: 'menu' },
  { href: '/user/cart', label: 'My Cart', icon: 'cart' },
  { href: '/user/orders', label: 'My Orders', icon: 'orders' },
  { href: '/user/history', label: 'Order History', icon: 'history' },
  { href: '/user/profile', label: 'Profile', icon: 'profile' },
]

const BOTTOM: NavItem[] = [
  { href: '/user/dashboard', label: 'Home', icon: 'dashboard' },
  { href: '/user/menu', label: 'Menu', icon: 'menu' },
  { href: '/user/cart', label: 'Cart', icon: 'cart' },
  { href: '/user/orders', label: 'Orders', icon: 'orders' },
  { href: '/user/profile', label: 'Profile', icon: 'profile' },
]

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser('USER')
  return (
    <CartProvider userId={user.id}>
      <PortalShell
        portalLabel="User"
        nav={NAV}
        bottomNav={BOTTOM}
        user={{ name: user.name, subtitle: user.profile?.externalStudentId ?? user.email }}
        topRight={<LiveUpdates />}
      >
        {children}
      </PortalShell>
    </CartProvider>
  )
}
