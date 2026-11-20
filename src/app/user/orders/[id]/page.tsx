import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckPaymentButton } from '@/components/user/check-payment-button'
import { REFUND_LABEL, REFUND_MESSAGE, SUPPORT_EMAIL, expectedCreditText } from '@/lib/refund-status'
import { syncRefund } from '@/lib/payments/refunds'
import { ArrowLeft, Clock, ReceiptText } from 'lucide-react'
import { requirePortalUser } from '@/lib/auth/guards'
import { env } from '@/lib/env'
import { getUserOrder } from '@/lib/queries/user'
import { formatINR } from '@/lib/money'
import { ORDER_STATUS_LABEL } from '@/lib/order-status'
import { formatDateTime, formatTime } from '@/lib/time'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/misc'
import { OrderProgress } from '@/components/ui/order-progress'
import { CancelOrderButton } from '@/components/user/order-actions'

export const metadata: Metadata = { title: 'Track order' }
export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ paid?: string; payment?: string }>
}) {
  const user = await requirePortalUser('USER')
  const [{ id }, sp] = await Promise.all([params, searchParams])
  let order = await getUserOrder(user.id, id)
  if (!order) notFound()
  // Refund still with Razorpay: ask Razorpay directly (at most once a minute)
  const r = order.refund
  if (r && (r.status === 'REQUESTED' || r.status === 'PROCESSING') && (!r.checkedAt || Date.now() - r.checkedAt.getTime() > 60_000)) {
    const changed = await syncRefund(r.id).catch(() => null)
    if (changed === 'processed' || changed === 'failed') order = (await getUserOrder(user.id, id)) ?? order
  }
  const tz = env.timezone
  const showToken = order.pickupToken && ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.status)

  return (
    <div>
      <Link href="/user/orders" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> My orders
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-subtle">Order {order.orderNumber}</div>
          <h1 className="mt-1 text-2xl font-bold text-ink">
            {order.status === 'READY' ? 'Your food is ready! 🎉' : ORDER_STATUS_LABEL[order.status]}
          </h1>
          <div className="mt-1 text-sm text-muted">Placed {formatDateTime(order.createdAt, tz)}</div>
        </div>
        <OrderStatusBadge status={order.status} refundStatus={order.refund?.status} className="text-sm" />
      </div>

      {sp.paid && order.status === 'CONFIRMED' && (
        <Notice tone="success" title="Payment verified" className="mb-6">Your order has been sent to the kitchen.</Notice>
      )}
      {sp.paid && order.status === 'PAYMENT_PENDING' && (
        <Notice tone="info" title="Confirming your payment…" className="mb-6">
          This usually takes a few seconds. This page updates automatically.
        </Notice>
      )}
      {(sp.payment === 'cancelled' || sp.payment === 'failed') && order.status === 'PAYMENT_PENDING' && (
        <Notice tone="warning" className="mb-6">Payment was not completed. You can pay now or cancel the order.</Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-6">
          {order.status === 'PAYMENT_PENDING' && order.payment && (
            <Card className="border-warning/40">
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="font-semibold">Waiting for payment</div>
                  <div className="text-sm text-muted">Pay within 30 minutes of placing the order or it will expire.</div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {order.payment.provider === 'RAZORPAY' && <CheckPaymentButton orderId={order.id} />}
                  <ButtonLink href={`/user/pay/${order.payment.id}`} size="lg">Pay {formatINR(order.totalPaise)}</ButtonLink>
                </div>
              </CardBody>
            </Card>
          )}

          {['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED'].includes(order.status) && (
            <Card>
              <CardBody>
                <OrderProgress status={order.status} />
                {order.estimatedReadyAt && !['READY', 'COLLECTED'].includes(order.status) && (
                  <p className="mt-5 flex items-center justify-center gap-2 text-sm text-muted">
                    <Clock className="h-4 w-4 text-accent" />
                    {order.pickupSlotStart ? 'Pickup slot' : 'Estimated ready'} around{' '}
                    <strong className="text-ink">{formatTime(order.estimatedReadyAt, tz)}</strong>
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {order.status === 'CANCELLED' && !order.refund && (
            <Notice tone="danger" title="Order cancelled">
              {order.cancelReason && <>Reason: {order.cancelReason}. </>}No payment was taken for this order.
            </Notice>
          )}

          {order.refund && <RefundPanel refund={order.refund} cancelReason={order.cancelReason} method={order.payment?.method ?? null} tz={tz} />}

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><ReceiptText className="h-4.5 w-4.5 text-accent" /> Items</span>} />
            <CardBody className="pt-4">
              <ul className="space-y-2.5 text-[15px]">
                {order.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span>{i.name} <span className="text-muted">× {i.quantity}</span></span>
                    <span className="tabular-nums">{formatINR(i.lineTotalPaise)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-[15px]">
                <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatINR(order.subtotalPaise)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Fees</dt><dd className="tabular-nums">{order.feesPaise ? formatINR(order.feesPaise) : 'Free'}</dd></div>
                <div className="flex justify-between pt-1 font-bold"><dt>Total</dt><dd className="tabular-nums text-primary">{formatINR(order.totalPaise)}</dd></div>
              </dl>
              {order.payment && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
                  Payment: <PaymentStatusBadge status={order.payment.status} orderCancelled={order.status === 'CANCELLED'} />
                  {order.payment.method && <span>· {order.payment.method}</span>}
                  {order.payment.provider === 'SIMULATOR' && <span className="text-warning-ink">· simulated</span>}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <CardBody className="pt-4">
              <ol className="relative space-y-4 border-l-2 border-line pl-5">
                {order.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full border-2 border-surface bg-accent" aria-hidden />
                    <div className="text-sm font-semibold text-ink">{ORDER_STATUS_LABEL[h.toStatus]}</div>
                    <div className="text-xs text-subtle">{formatDateTime(h.createdAt, tz)}{h.note ? ` · ${h.note}` : ''}</div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6">
          {showToken && (
            <Card className={order.status === 'READY' ? 'border-success/50 ring-4 ring-success/10' : ''}>
              <CardBody className="text-center">
                <div className="text-sm font-semibold text-muted">Pickup code</div>
                <div className="mt-2 font-mono text-4xl font-bold tracking-[0.3em] text-primary">{order.pickupToken}</div>
                {order.qrSvg && (
                  <div
                    className="mx-auto mt-4 w-48 rounded-2xl border border-line bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
                    role="img"
                    aria-label={`QR code for pickup token ${order.pickupToken}`}
                    dangerouslySetInnerHTML={{ __html: order.qrSvg }}
                  />
                )}
                <p className="mt-4 text-sm text-muted">
                  {order.status === 'READY' ? 'Show this at the pickup counter.' : 'You’ll need this when your order is ready.'}
                </p>
              </CardBody>
            </Card>
          )}
          {order.canCancel && (
            <Card>
              <CardBody className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">Changed your mind?</span>
                <CancelOrderButton orderId={order.id} paid={order.status !== 'PAYMENT_PENDING'} />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

type RefundView = NonNullable<NonNullable<Awaited<ReturnType<typeof getUserOrder>>>['refund']>

/** The same refund status and wording as staff and canteen see (lib/refund-status). */
function RefundPanel({ refund, cancelReason, method, tz }: { refund: RefundView; cancelReason: string | null; method: string | null; tz: string }) {
  const tone = refund.status === 'CREDITED' ? 'success' : refund.status === 'FAILED' || refund.status === 'REVERSED' ? 'danger' : 'info'
  const expected = expectedCreditText(refund.status, refund.speedProcessed)
  const problem = refund.status === 'FAILED' || refund.status === 'REVERSED'
  return (
    <Notice tone={tone} title={REFUND_LABEL[refund.status]}>
      <p>{REFUND_MESSAGE[refund.status]}</p>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        <div><dt className="inline text-muted">Amount: </dt><dd className="inline font-semibold">{formatINR(refund.amountPaise)}</dd></div>
        {method && <div><dt className="inline text-muted">To: </dt><dd className="inline">your original payment method ({method})</dd></div>}
        <div><dt className="inline text-muted">Requested: </dt><dd className="inline">{formatDateTime(refund.requestedAt, tz)}</dd></div>
        {refund.processedAt && (
          <div><dt className="inline text-muted">Processed by Razorpay: </dt><dd className="inline">{formatDateTime(refund.processedAt, tz)}</dd></div>
        )}
        {refund.creditedAt && (
          <div><dt className="inline text-muted">Bank credit confirmed: </dt><dd className="inline">{formatDateTime(refund.creditedAt, tz)}</dd></div>
        )}
        {refund.reference && <div><dt className="inline text-muted">Razorpay refund ID: </dt><dd className="inline font-mono">{refund.reference}</dd></div>}
        {refund.bankReference && <div><dt className="inline text-muted">Bank reference (ARN/UTR): </dt><dd className="inline font-mono">{refund.bankReference}</dd></div>}
      </dl>
      {expected && <p className="mt-3 text-sm text-muted">{expected}</p>}
      {cancelReason && <p className="mt-2 text-sm text-muted">Cancellation reason: {cancelReason}</p>}
      {(problem || refund.status === 'PROCESSED') && (
        <p className="mt-3 text-sm">
          {problem ? 'Please contact support' : 'Not received after 7 working days? Contact support'} at{' '}
          <a className="font-semibold underline" href={`mailto:${SUPPORT_EMAIL}?subject=Refund%20for%20order`}>{SUPPORT_EMAIL}</a>
          {refund.bankReference ? ' and quote the bank reference above, which your bank can trace.' : ' with your order number.'}
        </p>
      )}
    </Notice>
  )
}
