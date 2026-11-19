import Link from 'next/link'
import { SiteNav } from '@/components/site/site-nav'
import { Logo } from '@/components/ui/logo'

const FOOTER = [
  { href: '/about', label: 'About' },
  { href: '/#contact', label: 'Contact' },
  { href: '/support', label: 'Support' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms and Conditions' },
  { href: '/refund-policy', label: 'Cancellation & Refunds' },
  { href: '/shipping-policy', label: 'Pickup & Delivery' },
  { href: '/credits', label: 'Photo credits' },
]

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted">
              Pre-order from your campus canteen, pay with UPI, and pick up when it&apos;s ready.
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">CampusBite</h2>
            <ul className="mt-3 space-y-2">
              {FOOTER.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Portals</h2>
            <ul className="mt-3 space-y-2">
              <li><Link href="/login" className="text-sm text-muted hover:text-primary">Sign in</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-5 text-sm text-subtle sm:px-6">
            © {new Date().getFullYear()} CampusBite. Made for campus life.
          </div>
        </div>
      </footer>
    </div>
  )
}
