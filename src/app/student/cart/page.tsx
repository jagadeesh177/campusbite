import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { PageHeader } from '@/components/ui/misc'
import { CartView } from './cart-view'

export const metadata: Metadata = { title: 'My cart' }

export default async function CartPage() {
  await requirePortalUser('STUDENT')
  return (
    <>
      <PageHeader title="My cart" />
      <CartView />
    </>
  )
}
