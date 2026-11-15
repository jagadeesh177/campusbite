import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { getKitchenSettings, kitchenStatus } from '@/lib/kitchen'
import { getMenu } from '@/lib/queries/student'
import { Notice, PageHeader } from '@/components/ui/misc'
import { MenuBrowser } from '@/components/student/menu-browser'

export const metadata: Metadata = { title: 'Food menu' }
export const dynamic = 'force-dynamic'

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await requirePortalUser('STUDENT')
  const [{ category }, menu, settings] = await Promise.all([searchParams, getMenu(), getKitchenSettings()])
  const kitchen = kitchenStatus(settings)
  return (
    <>
      <PageHeader title="Food menu" description="Fresh from the campus canteen. Availability updates live." />
      {!kitchen.open && (
        <Notice tone="warning" title="Ordering is closed right now" className="mb-6">
          {kitchen.message} You can still browse and build your cart.
        </Notice>
      )}
      <MenuBrowser categories={menu.categories} items={menu.items} initialCategory={category} />
    </>
  )
}
