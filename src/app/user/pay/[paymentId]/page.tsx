import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requirePortalUser, toActor } from '@/lib/auth/guards'
import { getCheckoutSession } from '@/lib/orders/create-order'
import { expireStalePendingOrders } from '@/lib/orders/expire'
import { formatINR, rupeesToPaise } from '@/lib/money'
import { Card, CardBody } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/misc'
import { RazorpayRetry, SimulatorPanel } from './pay-panel'

export const metadata: Metadata = { title: 'Complete payment' }
export const dynamic = 'force-dynamic'

export default async function PayPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const user = await requirePortalUser('USER')
  const { paymentId } = await params
  await expireStalePendingOrders() // don't offer payment for an order past its 30-minute window
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { order: { include: { items: true } } },
  })
  // Ownership check — never reveal other users' payments
  if (!payment || payment.order.userId !== user.id) notFound()
  if (payment.order.status !== 'PAYMENT_PENDING') redirect(`/user/orders/${payment.orderId}`)

  const order = payment.order
  const amountPaise = rupeesToPaise(payment.amount)

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Complete payment" description={`Order ${order.orderNumber}`} />
      <Card>
        <CardBody>
          <ul className="space-y-2 text-[15px]">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span>{i.nameSnapshot} <span className="text-muted">× {i.quantity}</span></span>
                <span className="tabular-nums">{formatINR(rupeesToPaise(i.lineTotal))}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-line pt-4 text-lg font-bold">
            <span>Amount</span>
            <span className="tabular-nums text-primary">{formatINR(amountPaise)}</span>
          </div>
          <div className="mt-6">
            {payment.provider === 'SIMULATOR' ? (
              <SimulatorPanel paymentId={payment.id} orderId={order.id} amountPaise={amountPaise} />
            ) : (
              <RazorpayRetry session={await getCheckoutSession(toActor(user), order.id)} user={{ name: user.name, email: user.email, phone: user.profile?.phone ?? null }} />
            )}
          </div>
          <p className="mt-4 text-center text-xs text-subtle">Unpaid orders expire after 30 minutes.</p>
        </CardBody>
      </Card>
    </div>
  )
}
