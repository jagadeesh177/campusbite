import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { getMenuAdmin } from '@/lib/queries/menu-admin'
import { PageHeader } from '@/components/ui/misc'
import { MenuManager } from '@/components/menu/menu-manager'

export const metadata: Metadata = { title: 'Menu' }
export const dynamic = 'force-dynamic'

export default async function StaffFoodPage() {
  await requirePortalUser('STAFF', 'FOOD')
  return (
    <>
      <PageHeader title="Menu" description="Food items, categories, prices and availability. Price changes are recorded in the activity log." />
      <MenuManager data={await getMenuAdmin()} />
    </>
  )
}
