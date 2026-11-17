import type { Metadata } from 'next'
import Link from 'next/link'
import { Bell, Clock } from 'lucide-react'
import { requirePortalUser } from '@/lib/auth/guards'
import { env } from '@/lib/env'
import { getKitchenSettings, kitchenStatus } from '@/lib/kitchen'
import { getActiveOrders, getMenu, getUnreadNotifications } from '@/lib/queries/user'
import { formatDateTime } from '@/lib/time'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Notice } from '@/components/ui/misc'
import { MenuBrowser } from '@/components/user/menu-browser'
import { ActiveOrderCard } from '@/components/user/active-order-card'
import { markNotificationsReadAction } from '@/app/actions/user'

export const metadata: Metadata = { title: 'Home' }
export const dynamic = 'force-dynamic'

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** Home = your current order (if any) + the full menu. Browse → add to cart → pay. */
export default async function UserHome({
  searchParams,
}: {
  searchParams: Promise<{ activated?: string; passwordReset?: string; category?: string }>
}) {
  const user = await requirePortalUser('USER')
  const { activated, passwordReset, category } = await searchParams
  const [active, menu, settings, notifications] = await Promise.all([
    getActiveOrders(user.id),
    getMenu(),
    getKitchenSettings(),
    getUnreadNotifications(user.id),
  ])
  const kitchen = kitchenStatus(settings)

  return (
    <div className="space-y-6">
      {activated && <Notice tone="success" title="Your CampusBite account is ready!">Welcome aboard — you can start ordering right away.</Notice>}
      {passwordReset && <Notice tone="success" title="Your password has been updated">You&apos;ve been signed out on other devices.</Notice>}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{greeting(env.timezone)},</p>
          <h1 className="text-2xl font-bold text-ink">{user.name.split(' ')[0]} 👋</h1>
        </div>
        {kitchen.open ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-sm font-semibold text-success">
            <Clock className="h-4 w-4" aria-hidden /> Open · ready in ~{settings.defaultPrepMinutes} min
          </span>
        ) : null}
      </header>

      {!kitchen.open && (
        <Notice tone="warning" title="Ordering is closed right now">
          {kitchen.message} You can still look at the menu.
        </Notice>
      )}

      {active.length > 0 && (
        <section aria-label="Your current orders">
          <div className="grid gap-4 lg:grid-cols-2">
            {active.map((o) => (
              <ActiveOrderCard key={o.id} order={o} tz={env.timezone} />
            ))}
          </div>
        </section>
      )}

      {notifications.length > 0 && (
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><Bell className="h-4.5 w-4.5 text-accent" /> Updates</span>}
            action={
              <form action={markNotificationsReadAction}>
                <button className="-my-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary hover:underline">Mark all read</button>
              </form>
            }
          />
          <CardBody className="pt-3">
            <ul className="divide-y divide-line">
              {notifications.slice(0, 3).map((n) => (
                <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                  <Link href={n.orderId ? `/user/orders/${n.orderId}` : '/user/orders'} className="block hover:text-primary">
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold">{n.title}</span>
                      <span className="shrink-0 text-xs text-subtle">{formatDateTime(n.createdAt, env.timezone)}</span>
                    </div>
                    <p className="text-sm text-muted">{n.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <section aria-label="Menu">
        <h2 className="mb-3 text-lg font-bold text-ink">Menu</h2>
        <MenuBrowser categories={menu.categories} items={menu.items} initialCategory={category} />
      </section>
    </div>
  )
}
