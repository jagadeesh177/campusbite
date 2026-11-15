import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { getMenuAdmin } from '@/lib/queries/menu-admin'
import { PageHeader } from '@/components/ui/misc'
import { MenuManager } from '@/components/menu/menu-manager'

export const metadata: Metadata = { title: 'Food & menu' }
export const dynamic = 'force-dynamic'

export default async function StaffFoodPage() {
  await requirePortalUser('STAFF', 'FOOD')
  return (
    <>
      <PageHeader title="Food & menu" description="All menu items, categories, prices and availability. Price changes are recorded in the audit log." />
      <MenuManager data={await getMenuAdmin()} />
    </>
  )
}
