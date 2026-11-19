import type { Metadata } from 'next'
import { requirePortalUser } from '@/lib/auth/guards'
import { env } from '@/lib/env'
import { razorpayMode } from '@/lib/payments/gateway'
import { PageHeader } from '@/components/ui/misc'
import { CheckoutView } from './checkout-view'

export const metadata: Metadata = { title: 'Cart' }

/** One page: review items, choose a pickup time, pay. */
export default async function CartPage() {
  const user = await requirePortalUser('USER')
  return (
    <>
      <PageHeader title="Your cart" />
      <CheckoutView
        tz={env.timezone}
        provider={env.paymentProvider === 'razorpay' ? 'razorpay' : 'simulator'}
        razorpayTest={env.paymentProvider === 'razorpay' && razorpayMode(env.razorpay.keyId) === 'test'}
        user={{ name: user.name, email: user.email, phone: user.profile?.phone ?? null }}
      />
    </>
  )
}
