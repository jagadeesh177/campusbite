import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { env } from '@/lib/env'
import { PageHeader } from '@/components/ui/misc'
import { CheckoutView } from './checkout-view'

export const metadata: Metadata = { title: 'Checkout' }

export default async function CheckoutPage() {
  const user = await requirePortalUser('STUDENT')
  return (
    <>
      <PageHeader title="Checkout" description="Review your order, choose a pickup time and pay." />
      <CheckoutView
        tz={env.timezone}
        provider={env.paymentProvider === 'razorpay' ? 'razorpay' : 'simulator'}
        student={{ name: user.name, email: user.email }}
      />
    </>
  )
}
