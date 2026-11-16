import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { getMenuAdmin } from '@/lib/queries/menu-admin'
import { PageHeader } from '@/components/ui/misc'
import { ButtonLink } from '@/components/ui/button'
import { MenuManager } from '@/components/menu/menu-manager'

export const metadata: Metadata = { title: 'Menu' }
export const dynamic = 'force-dynamic'

export default async function CanteenMenuPage() {
  const user = await requirePortalUser('CANTEEN', 'MENU')
  const data = await getMenuAdmin()
  return (
    <>
      <PageHeader
        title="Menu"
        description="Flip the switch to mark an item sold out — users see it immediately."
        action={user.permissions.includes('SETTINGS') ? <ButtonLink href="/canteen/settings" variant="secondary">Pause ordering</ButtonLink> : undefined}
      />
      <MenuManager data={data} />
    </>
  )
}
