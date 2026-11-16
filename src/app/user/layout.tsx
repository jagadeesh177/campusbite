import { requirePortalUser } from '@/lib/auth/guards'
import { CartProvider } from '@/components/portal/cart-context'
import { PortalShell, type NavItem } from '@/components/portal/portal-shell'
import { LiveUpdates } from '@/components/portal/live-updates'

// Browse food → add to cart → pay → track → collect
const NAV: NavItem[] = [
  { href: '/user/dashboard', label: 'Home', icon: 'dashboard' },
  { href: '/user/cart', label: 'Cart', icon: 'cart' },
  { href: '/user/orders', label: 'My Orders', icon: 'orders' },
  { href: '/user/profile', label: 'Profile', icon: 'profile' },
]

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser('USER')
  return (
    <CartProvider userId={user.id}>
      <PortalShell
        portalLabel="User"
        nav={NAV}
        bottomNav={NAV}
        user={{ name: user.name, subtitle: user.email }}
        topRight={<LiveUpdates />}
      >
        {children}
      </PortalShell>
    </CartProvider>
  )
}
