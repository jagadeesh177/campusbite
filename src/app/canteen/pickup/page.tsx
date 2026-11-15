import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { PageHeader } from '@/components/ui/misc'
import { PickupStation } from './pickup-station'

export const metadata: Metadata = { title: 'Verify pickup' }

export default async function PickupPage() {
  await requirePortalUser('CANTEEN', 'ORDERS')
  return (
    <>
      <PageHeader title="Verify pickup" description="Each code works once. Only paid, ready orders can be handed over." />
      <PickupStation />
    </>
  )
}
