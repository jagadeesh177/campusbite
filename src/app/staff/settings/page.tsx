import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { getKitchenFormValues } from '@/lib/queries/kitchen-form'
import { PageHeader } from '@/components/ui/misc'
import { KitchenSettingsForm } from '@/components/menu/kitchen-settings-form'

export const metadata: Metadata = { title: 'Kitchen settings' }
export const dynamic = 'force-dynamic'

export default async function StaffSettingsPage() {
  await requirePortalUser('STAFF', 'SETTINGS')
  return (
    <div className="max-w-3xl">
      <PageHeader title="Kitchen settings" description="Operating hours, capacity, pickup slots and fees." />
      <KitchenSettingsForm values={await getKitchenFormValues()} />
    </div>
  )
}
