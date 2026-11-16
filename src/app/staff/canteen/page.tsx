import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { requirePortalUser } from '@/lib/auth/guards'
import { CANTEEN_PERMISSIONS } from '@/lib/auth/permissions'
import { getKitchenSettings, kitchenStatus } from '@/lib/kitchen'
import { ORDER_STATUS_LABEL } from '@/lib/order-status'
import { formatDateTime } from '@/lib/time'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/misc'
import { SectionTabs, accountTabs } from '@/components/staff/section-tabs'
import { AccountsManager } from '@/components/staff/accounts-manager'

export const metadata: Metadata = { title: 'Canteen management' }
export const dynamic = 'force-dynamic'

export default async function CanteenManagementPage() {
  const user = await requirePortalUser('STAFF', 'CANTEEN_ACCOUNTS')
  const [operators, activity, settings] = await Promise.all([
    db.user.findMany({ where: { role: 'CANTEEN' }, include: { canteenProfile: true }, orderBy: { name: 'asc' } }),
    db.orderStatusHistory.findMany({
      where: { actorRole: 'CANTEEN' },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { changedBy: { select: { name: true } }, order: { select: { orderNumber: true } } },
    }),
    getKitchenSettings(),
  ])
  const kitchen = kitchenStatus(settings)

  return (
    <>
      <PageHeader title="Accounts" description="Canteen operator accounts and what each one can do." />
      <SectionTabs tabs={accountTabs(user.permissions)} active="/staff/canteen" />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-start">
        <AccountsManager
          kind="CANTEEN"
          labelName="Counter / station"
          catalogue={CANTEEN_PERMISSIONS}
          accounts={operators.map((o) => ({
            id: o.id,
            name: o.name,
            email: o.email,
            label: o.canteenProfile?.counterName ?? null,
            status: o.status,
            permissions: o.canteenProfile?.permissions ?? [],
            lastLogin: o.lastLoginAt ? formatDateTime(o.lastLoginAt, env.timezone) : null,
            isSelf: o.id === user.id,
          }))}
        />
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Operating hours"
              action={<Badge tone={kitchen.open ? 'success' : 'warning'} dot>{kitchen.open ? 'Taking orders' : 'Not taking orders'}</Badge>}
            />
            <CardBody className="pt-4">
              <div className="font-display text-2xl font-bold">{settings.openingTime} – {settings.closingTime}</div>
              <p className="mt-1 text-sm text-muted">Max {settings.maxConcurrentOrders} orders in the kitchen · {settings.pickupSlotMinutes}-minute pickup slots</p>
              {user.permissions.includes('SETTINGS') && (
                <ButtonLink href="/staff/settings" variant="secondary" size="sm" className="mt-4">Configure</ButtonLink>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Recent canteen activity" />
            <CardBody className="pt-4">
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li key={a.id} className="text-sm">
                    <span className="font-semibold">{a.changedBy?.name ?? 'Canteen'}</span>{' '}
                    <span className="text-muted">moved</span> <span className="font-mono">{a.order.orderNumber}</span>{' '}
                    <span className="text-muted">to</span> {ORDER_STATUS_LABEL[a.toStatus]}
                    <div className="text-xs text-subtle">{formatDateTime(a.createdAt, env.timezone)}</div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
