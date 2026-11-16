import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { getMenuAdmin } from '@/lib/queries/menu-admin'
import { PageHeader } from '@/components/ui/misc'
import { MenuManager } from '@/components/menu/menu-manager'

export const metadata: Metadata = { title: 'Menu' }
export const dynamic = 'force-dynamic'

export default async function CanteenMenuPage() {
  await requirePortalUser('CANTEEN', 'MENU')
  const data = await getMenuAdmin()
  return (
    <>
      <PageHeader
        title="Menu"
        description="Add or edit food and prices. Flip the switch to mark an item sold out — users see it immediately."
      />
      <MenuManager data={data} />
    </>
  )
}
