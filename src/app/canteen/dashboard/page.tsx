import type { Metadata } from 'next'
import { QrCode } from 'lucide-react'
import { requirePortalUser } from '@/lib/auth/guards'
import { env } from '@/lib/env'
import { getKitchenSettings, kitchenStatus } from '@/lib/kitchen'
import { getKitchenBoard } from '@/lib/queries/canteen'
import { formatINR } from '@/lib/money'
import { Notice } from '@/components/ui/misc'
import { ButtonLink } from '@/components/ui/button'
import { OrderBoard } from '@/components/canteen/order-board'
import { AcceptingSwitch } from '@/components/canteen/accepting-switch'

export const metadata: Metadata = { title: 'Orders' }
export const dynamic = 'force-dynamic'

/** The canteen's main screen: New → Preparing → Ready → Completed. */
export default async function CanteenOrders({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Orders</h1>
          <p className="text-sm text-muted">
            Today: {stats.completedToday} collected · {formatINR(stats.salesTodayPaise)} sales
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AcceptingSwitch accepting={settings.acceptingOrders} />
          <ButtonLink href="/canteen/pickup" size="lg">
            <QrCode className="h-5 w-5" /> Verify pickup
          </ButtonLink>
        </div>
      </div>
      {denied && <Notice tone="warning" className="mb-4">You don&apos;t have permission for that page.</Notice>}
      {!kitchen.open && settings.acceptingOrders && (
        <Notice tone="warning" title="Users can’t place new orders right now" className="mb-4">
          {kitchen.message}
        </Notice>
      )}
      <OrderBoard orders={orders} tz={env.timezone} />
    </>
  )
}
