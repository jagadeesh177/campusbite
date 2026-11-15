import type { Metadata } from 'next'
import { CheckCircle2, ChefHat, IndianRupee, Inbox, PackageCheck } from 'lucide-react'
import { requirePortalUser } from '@/lib/auth/guards'
import { env } from '@/lib/env'
import { getKitchenSettings, kitchenStatus } from '@/lib/kitchen'
import { getKitchenBoard } from '@/lib/queries/canteen'
import { formatINR } from '@/lib/money'
import { Notice, PageHeader, StatCard } from '@/components/ui/misc'
import { ButtonLink } from '@/components/ui/button'
import { OrderBoard } from '@/components/canteen/order-board'

export const metadata: Metadata = { title: 'Orders' }
export const dynamic = 'force-dynamic'

export default async function CanteenDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePortalUser('CANTEEN')
  const { denied } = await searchParams
  if (!user.permissions.includes('ORDERS')) {
    return (
      <Notice tone="info" title="No order access">
        Your account manages {user.permissions.map((p) => p.toLowerCase()).join(', ') || 'nothing yet'}. Use the menu on the left.
      </Notice>
    )
  }
  const [{ orders, stats }, settings] = await Promise.all([getKitchenBoard(), getKitchenSettings()])
  const kitchen = kitchenStatus(settings)

  return (
    <>
      <PageHeader
        title="Kitchen orders"
        description="Paid orders appear here instantly. Tap the big button to move each order along."
        action={<ButtonLink href="/canteen/pickup" variant="secondary">Verify pickup</ButtonLink>}
      />
      {denied && <Notice tone="warning" className="mb-4">You don&apos;t have permission for that page.</Notice>}
      {!kitchen.open && (
        <Notice tone="warning" title="Students can’t place new orders right now" className="mb-4">
          {kitchen.message}
        </Notice>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="New" value={stats.newOrders} icon={Inbox} tone="info" />
        <StatCard label="Preparing" value={stats.preparing} icon={ChefHat} tone="accent" />
        <StatCard label="Ready" value={stats.ready} icon={PackageCheck} tone="success" />
        <StatCard label="Completed today" value={stats.completedToday} icon={CheckCircle2} tone="primary" />
        <StatCard label="Today’s sales" value={formatINR(stats.salesTodayPaise)} icon={IndianRupee} tone="primary" />
      </div>
      <OrderBoard orders={orders} tz={env.timezone} />
    </>
  )
}
