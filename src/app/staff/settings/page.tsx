import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { getKitchenFormValues } from '@/lib/queries/kitchen-form'
import { PageHeader } from '@/components/ui/misc'
import { SectionTabs, settingsTabs } from '@/components/staff/section-tabs'
import { KitchenSettingsForm } from '@/components/menu/kitchen-settings-form'

export const metadata: Metadata = { title: 'Kitchen settings' }
export const dynamic = 'force-dynamic'

export default async function StaffSettingsPage() {
  const user = await requirePortalUser('STAFF', 'SETTINGS')
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Opening hours, capacity, pickup slots and fees." />
      <SectionTabs tabs={settingsTabs(user.permissions)} active="/staff/settings" />
      <KitchenSettingsForm values={await getKitchenFormValues()} />
    </div>
  )
}
