import type { Metadata } from 'next'
import Link from 'next/link'
import { Bell, ChefHat, Clock, Coffee, Cookie, IceCreamCone, Pizza, Soup, Sunrise, UtensilsCrossed } from 'lucide-react'
import { requirePortalUser } from '@/lib/auth/guards'
import { env } from '@/lib/env'
import { getKitchenSettings, kitchenStatus } from '@/lib/kitchen'
import { getActiveOrders, getMenu, getRecommendations, getUnreadNotifications } from '@/lib/queries/user'
import { formatDateTime } from '@/lib/time'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { Notice } from '@/components/ui/misc'
import { FoodCard } from '@/components/user/food-card'
import { ActiveOrderCard } from '@/components/user/active-order-card'
import { markNotificationsReadAction } from '@/app/actions/user'

export const metadata: Metadata = { title: 'User Dashboard' }
export const dynamic = 'force-dynamic'

const CATEGORY_ICON: Record<string, typeof Coffee> = {
  breakfast: Sunrise,
  meals: Soup,
  snacks: Cookie,
  beverages: Coffee,
  'fast-food': Pizza,
  desserts: IceCreamCone,
}

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default async function UserDashboard({ searchParams }: { searchParams: Promise<{ activated?: string; passwordReset?: string }> }) {
  const user = await requirePortalUser('USER')
  const { activated, passwordReset } = await searchParams
  const [active, menu, recommendedRaw, settings, notifications] = await Promise.all([
    getActiveOrders(user.id),
    getMenu(),
    getRecommendations(user.id),
    getKitchenSettings(),
    getUnreadNotifications(user.id),
  ])
  const kitchen = kitchenStatus(settings)
  const popular = menu.items.filter((i) => i.isPopular && i.isAvailable).slice(0, 4)
  const recommended = recommendedRaw
    .map((r) => menu.items.find((i) => i.id === r.id))
    .filter((i): i is NonNullable<typeof i> => !!i)
  const available = menu.items.filter((i) => i.isAvailable).length
  const firstName = user.name.split(' ')[0]

  return (
    <div className="space-y-8">
      {activated && <Notice tone="success" title="Your CampusBite account is ready!">Welcome aboard — you can start ordering right away.</Notice>}
      {passwordReset && <Notice tone="success" title="Your password has been updated">You&apos;ve been signed out on other devices.</Notice>}

      <section className="relative overflow-hidden rounded-[1.5rem] bg-primary p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -top-20 -right-16 h-64 w-64 rounded-full bg-accent/30 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-white/70">{greeting(env.timezone)},</p>
            <h1 className="mt-1 text-3xl font-bold">{firstName} 👋</h1>
            <p className="mt-2 max-w-md text-white/80">
              {kitchen.open ? 'The kitchen is open. What are you craving today?' : kitchen.message}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-1.5 text-xs text-white/70"><Clock className="h-3.5 w-3.5" /> Est. prep time</div>
              <div className="mt-0.5 text-lg font-bold">~{settings.defaultPrepMinutes} min</div>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-1.5 text-xs text-white/70"><ChefHat className="h-3.5 w-3.5" /> Available now</div>
              <div className="mt-0.5 text-lg font-bold">{available} items</div>
            </div>
          </div>
        </div>
        <div className="relative mt-6">
          <ButtonLink href="/user/menu" variant="secondary" size="lg" className="border-transparent">
            <UtensilsCrossed className="h-5 w-5" /> Browse menu
          </ButtonLink>
        </div>
      </section>

      {active.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-ink">Current order{active.length > 1 ? 's' : ''}</h2>
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
                <button className="text-sm font-semibold text-primary hover:underline">Mark all read</button>
              </form>
            }
          />
          <CardBody className="pt-3">
            <ul className="divide-y divide-line">
              {notifications.map((n) => (
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

      <section>
        <h2 className="mb-3 text-lg font-bold text-ink">Categories</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {menu.categories.map((c) => {
            const Icon = CATEGORY_ICON[c.slug] ?? UtensilsCrossed
            return (
              <Link
                key={c.id}
                href={`/user/menu?category=${c.slug}`}
                className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-4 text-center shadow-card transition hover:border-accent/40 hover:shadow-lift"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                  <Icon className="h-5.5 w-5.5" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-ink">{c.name}</span>
                <span className="text-xs text-subtle">{c.count} items</span>
              </Link>
            )
          })}
        </div>
      </section>

      {recommended.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-bold text-ink">Your usuals</h2>
            <span className="text-sm text-muted">Based on your past orders</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {recommended.map((i) => (
              <FoodCard key={i.id} item={i} layout="row" />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-bold text-ink">Popular on campus</h2>
          <Link href="/user/menu" className="text-sm font-semibold text-primary hover:underline">See full menu</Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {popular.map((i) => (
            <FoodCard key={i.id} item={i} />
          ))}
        </div>
      </section>
    </div>
  )
}
