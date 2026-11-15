import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { getKitchenFormValues } from '@/lib/queries/kitchen-form'
import { PageHeader } from '@/components/ui/misc'
import { KitchenSettingsForm } from '@/components/menu/kitchen-settings-form'

export const metadata: Metadata = { title: 'Kitchen settings' }
export const dynamic = 'force-dynamic'

export default async function CanteenSettingsPage() {
  await requirePortalUser('CANTEEN', 'SETTINGS')
  return (
    <div className="max-w-3xl">
      <PageHeader title="Kitchen settings" description="Hours, capacity and pickup slots." />
      <KitchenSettingsForm values={await getKitchenFormValues()} />
    </div>
  )
}
