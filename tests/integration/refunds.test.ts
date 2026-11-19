import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

// ---------------------------------------------------------------------------
// In-memory stand-in for Razorpay's refund API (no network, no money).
// Each test sets how the next refund behaves.
// ---------------------------------------------------------------------------
type FakeRefund = {
  id: string
  payment_id: string
  amount: number
  status: 'pending' | 'processed' | 'failed'
  receipt: string | null
  notes: Record<string, string>
  speed_requested: string
  speed_processed: string | null
  acquirer_data: Record<string, string | null>
}
const fake = vi.hoisted(() => ({
  seq: 0,
  orders: new Map<string, number>(),
  refunds: new Map<string, FakeRefund>(),
  refundCalls: [] as { paymentId: string; params: Record<string, unknown> }[],
  next: { status: 'pending' as 'pending' | 'processed' | 'failed', error: null as null | 'balance' | 'timeout_after_create' },
}))

vi.mock('razorpay', () => ({
  default: class FakeRazorpay {
    orders = {
      create: async (o: { amount: number }) => {
        const id = `order_t${++fake.seq}`
        fake.orders.set(id, o.amount)
        return { id }
      },
      fetchPayments: async () => ({ items: [] }),
    }
    payments = {
      refund: async (paymentId: string, params: Record<string, unknown>) => {
        fake.refundCalls.push({ paymentId, params })
        if (fake.next.error === 'balance') {
          throw { statusCode: 400, error: { code: 'BAD_REQUEST_ERROR', description: 'Your account does not have enough balance to carry out the refund operation.' } }
        }
        const r: FakeRefund = {
          id: `rfnd_t${++fake.seq}`,
          payment_id: paymentId,
          amount: Number(params.amount),
          status: fake.next.status,
          receipt: String(params.receipt),
          notes: params.notes as Record<string, string>,
          speed_requested: String(params.speed),
          speed_processed: fake.next.status === 'processed' ? 'instant' : null,
          acquirer_data: { arn: null },
        }
        fake.refunds.set(r.id, r)
        if (fake.next.error === 'timeout_after_create') throw new Error('socket hang up') // created, but we never heard back
        return r
      },
      fetchMultipleRefund: async (paymentId: string) => ({ items: [...fake.refunds.values()].filter((r) => r.payment_id === paymentId) }),
      fetchRefund: async (_p: string, id: string) => fake.refunds.get(id)!,
      fetch: async () => ({}),
      capture: async () => ({}),
    }
  },
}))

import { createOrder } from '@/lib/orders/create-order'
import { cancelOrderAsUser, changeOrderStatus } from '@/lib/orders/transitions'
import { confirmPayment } from '@/lib/payments/confirm'
import { confirmRefundCredited, createPartialRefund, processRefund, syncRefund } from '@/lib/payments/refunds'
import { handleRazorpayWebhook } from '@/lib/payments/razorpay-handlers'
import { getUserOrder } from '@/lib/queries/user'
import { REFUND_LABEL, REFUND_MESSAGE } from '@/lib/refund-status'
import { AppError } from '@/lib/errors'
import { createCanteen, createMenu, createStaff, createUser, prisma, resetDb, setupKitchen, uuid } from '../helpers'

const sign = (body: string) => createHmac('sha256', 'test_webhook_secret').update(body).digest('hex')
let menu: Awaited<ReturnType<typeof createMenu>>
const prevProvider = process.env.PAYMENT_PROVIDER

beforeAll(() => {
  process.env.PAYMENT_PROVIDER = 'razorpay'
})
afterAll(() => {
  process.env.PAYMENT_PROVIDER = prevProvider
})
beforeEach(async () => {
  await resetDb()
  await setupKitchen()
  menu = await createMenu()
  fake.refunds.clear()
  fake.refundCalls.length = 0
  fake.next = { status: 'pending', error: null }
})

/** A paid Razorpay order (payment captured and confirmed server-side). */
async function paidOrder() {
  const user = await createUser()
  const co = await createOrder(user.actor, { items: [{ foodItemId: menu.samosa.id, quantity: 2 }], idempotencyKey: uuid() })
  const r = await confirmPayment({ gatewayOrderId: co.gatewayOrderId, gatewayPaymentId: `pay_${uuid().slice(0, 8)}`, amountPaise: co.amountPaise, currency: 'INR', verifiedVia: 'webhook', method: 'upi' })
  expect(r.outcome).toBe('confirmed')
  return { ...user, co }
}
const refundOf = async (orderId: string) => prisma.refund.findFirstOrThrow({ where: { orderId } })
const orderStatus = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status

function refundEvent(type: string, r: FakeRefund, extra: Partial<FakeRefund> = {}) {
  return JSON.stringify({ event: type, payload: { refund: { entity: { ...r, ...extra } } } })
}
async function deliver(body: string, id = `evt_${uuid()}`) {
  return handleRazorpayWebhook(body, sign(body), id)
}

describe('requesting a refund', () => {
  it('asks Razorpay for the fastest speed (optimum) with our refund id, for the exact amount', async () => {
    const { actor, co } = await paidOrder()
    await cancelOrderAsUser(actor, co.orderId)
    expect(fake.refundCalls).toHaveLength(1)
    expect(fake.refundCalls[0].params).toMatchObject({ amount: co.amountPaise, speed: 'optimum' })
    const refund = await refundOf(co.orderId)
    expect(fake.refundCalls[0].params.receipt).toBe(refund.id)
    expect(refund.status).toBe('PROCESSING')
    expect(refund.speedRequested).toBe('optimum')
    expect(await orderStatus(co.orderId)).toBe('REFUND_PENDING')
  })

  it('an API response saying "processed" is not treated as confirmation', async () => {
    fake.next.status = 'processed'
    const { actor, co } = await paidOrder()
    await cancelOrderAsUser(actor, co.orderId)
    expect((await refundOf(co.orderId)).status).toBe('PROCESSING')
  })

  it('duplicate cancellation (double click / two tabs) creates one refund and one Razorpay call', async () => {
    const { actor, co } = await paidOrder()
    const results = await Promise.allSettled([cancelOrderAsUser(actor, co.orderId), cancelOrderAsUser(actor, co.orderId)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.refund.count({ where: { orderId: co.orderId } })).toBe(1)
    expect(fake.refundCalls).toHaveLength(1)
  })

  it('concurrent "send refund" clicks talk to Razorpay once', async () => {
    const { actor, co } = await paidOrder()
    fake.next.error = 'balance'
    await cancelOrderAsUser(actor, co.orderId) // first attempt fails → FAILED
    fake.next.error = null
    fake.refundCalls.length = 0
    const { actor: staff } = await createStaff()
    const refund = await refundOf(co.orderId)
    const outcomes = await Promise.all([processRefund(refund.id, staff), processRefund(refund.id, staff), processRefund(refund.id, staff)])
    expect(fake.refundCalls).toHaveLength(1)
    expect(outcomes.filter((o) => o === 'in_progress')).toHaveLength(2)
  })

  it('unpaid orders are cancelled without any refund', async () => {
    const user = await createUser()
    const co = await createOrder(user.actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    const r = await cancelOrderAsUser(user.actor, co.orderId)
    expect(r.status).toBe('CANCELLED')
    expect(await prisma.refund.count()).toBe(0)
    expect(fake.refundCalls).toHaveLength(0)
  })

  it('orders already being prepared cannot be cancelled for a refund', async () => {
    const { actor, co } = await paidOrder()
    const { actor: kitchen } = await createCanteen()
    await changeOrderStatus(kitchen, { orderId: co.orderId, to: 'ACCEPTED' })
    await changeOrderStatus(kitchen, { orderId: co.orderId, to: 'PREPARING' })
    await expect(cancelOrderAsUser(actor, co.orderId)).rejects.toBeInstanceOf(AppError)
    expect(fake.refundCalls).toHaveLength(0)
  })
})

describe('Razorpay webhooks drive the status', () => {
  it('refund.processed → PROCESSED (instant), still not "Refunded"; duplicates and late events change nothing', async () => {
    const { actor, co } = await paidOrder()
    await cancelOrderAsUser(actor, co.orderId)
    const rp = [...fake.refunds.values()][0]
    const processed = refundEvent('refund.processed', rp, { status: 'processed', speed_processed: 'instant', acquirer_data: { arn: '632221065056' } })
    expect((await deliver(processed, 'evt_p')).body).toBe('refund_processed')
    expect((await deliver(processed, 'evt_p')).body).toBe('duplicate') // same delivery retried
    expect((await deliver(processed)).body).toBe('refund_already_processed') // re-sent with a new id

    // a delayed refund.created arriving after processed must not move it back
    expect((await deliver(refundEvent('refund.created', rp, { status: 'pending' }))).body).toBe('refund_already_processed')

    const refund = await refundOf(co.orderId)
    expect(refund.status).toBe('PROCESSED')
    expect(refund.speedProcessed).toBe('instant')
    expect(refund.bankReference).toBe('632221065056')
    expect(refund.processedAt).not.toBeNull()
    expect(refund.creditedAt).toBeNull()
    expect(await orderStatus(co.orderId)).toBe('REFUND_PENDING')
    expect((await prisma.payment.findFirstOrThrow({ where: { orderId: co.orderId } })).status).toBe('REFUNDED')
  })

  it('refund.speed_changed records the fall-back to the normal route', async () => {
    const { actor, co } = await paidOrder()
    await cancelOrderAsUser(actor, co.orderId)
    const rp = [...fake.refunds.values()][0]
    expect((await deliver(refundEvent('refund.speed_changed', rp, { speed_processed: 'normal' }))).body).toBe('refund_speed_changed')
    const refund = await refundOf(co.orderId)
    expect(refund.status).toBe('PROCESSING')
    expect(refund.speedProcessed).toBe('normal')
  })

  it('refund.failed before processing → FAILED (retryable); after processing → REVERSED', async () => {
    const a = await paidOrder()
    await cancelOrderAsUser(a.actor, a.co.orderId)
    const ra = [...fake.refunds.values()][0]
    ra.status = 'failed' // Razorpay's own record now says failed
    await deliver(refundEvent('refund.failed', ra, { status: 'failed' }))
    expect((await refundOf(a.co.orderId)).status).toBe('FAILED')

    // retry sends a NEW refund (the failed one is not reused)
    const { actor: staff } = await createStaff()
    expect(await processRefund((await refundOf(a.co.orderId)).id, staff)).toBe('pending_gateway')
    expect(fake.refundCalls).toHaveLength(2)
    expect((await refundOf(a.co.orderId)).status).toBe('PROCESSING')

    const b = await paidOrder()
    await cancelOrderAsUser(b.actor, b.co.orderId)
    const rb = [...fake.refunds.values()].find((r) => r.payment_id !== ra.payment_id)!
    await deliver(refundEvent('refund.processed', rb, { status: 'processed' }))
    await deliver(refundEvent('refund.failed', rb, { status: 'failed' }))
    expect((await refundOf(b.co.orderId)).status).toBe('REVERSED')
  })

  it('rejects unsigned refund webhooks', async () => {
    const body = JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_x' } } } })
    expect((await handleRazorpayWebhook(body, 'bad', 'evt_bad')).status).toBe(400)
  })

  it('a missed webhook is recovered by asking Razorpay (status check)', async () => {
    const { actor, co } = await paidOrder()
    await cancelOrderAsUser(actor, co.orderId)
    const rp = [...fake.refunds.values()][0]
    rp.status = 'processed'
    rp.speed_processed = 'normal'
    expect(await syncRefund((await refundOf(co.orderId)).id)).toBe('processed')
    const refund = await refundOf(co.orderId)
    expect(refund.status).toBe('PROCESSED')
    expect(refund.speedProcessed).toBe('normal')
  })
})

describe('failures', () => {
  it('insufficient Razorpay balance → FAILED with a clear reason; retry after topping up works', async () => {
    fake.next.error = 'balance'
    const { actor, co } = await paidOrder()
    await cancelOrderAsUser(actor, co.orderId)
    let refund = await refundOf(co.orderId)
    expect(refund.status).toBe('FAILED')
    expect(refund.failureReason).toMatch(/balance is too low/i)

    fake.next.error = null
    const { actor: staff } = await createStaff()
    expect(await processRefund(refund.id, staff)).toBe('pending_gateway')
    refund = await refundOf(co.orderId)
    expect(refund.status).toBe('PROCESSING')
  })

  it('a request that timed out but reached Razorpay is found on retry — no second refund', async () => {
    fake.next.error = 'timeout_after_create'
    const { actor, co } = await paidOrder()
    await cancelOrderAsUser(actor, co.orderId)
    expect((await refundOf(co.orderId)).status).toBe('FAILED')
    expect(fake.refunds.size).toBe(1)

    fake.next.error = null
    const { actor: staff } = await createStaff()
    await processRefund((await refundOf(co.orderId)).id, staff)
    expect(fake.refunds.size).toBe(1) // reused, not duplicated
    const refund = await refundOf(co.orderId)
    expect(refund.status).toBe('PROCESSING')
    expect(refund.gatewayRefundId).toBe([...fake.refunds.keys()][0])
  })
})

describe('partial and full refunds', () => {
  it('staff can refund part of a payment once, never more than captured', async () => {
    const { co } = await paidOrder()
    const { actor: staff } = await createStaff()
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: co.orderId } })
    await expect(createPartialRefund(staff, { paymentId: payment.id, amountPaise: co.amountPaise + 100, reason: 'Too much' })).rejects.toBeInstanceOf(AppError)

    const r = await createPartialRefund(staff, { paymentId: payment.id, amountPaise: 1000, reason: 'Samosa missing' })
    expect(r.outcome).toBe('pending_gateway')
    expect(fake.refundCalls.at(-1)!.params.amount).toBe(1000)
    await expect(createPartialRefund(staff, { paymentId: payment.id, amountPaise: 500, reason: 'Again' })).rejects.toBeInstanceOf(AppError)

    const rp = [...fake.refunds.values()][0]
    await deliver(refundEvent('refund.processed', rp, { status: 'processed' }))
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('SUCCEEDED') // only part refunded
    expect(await orderStatus(co.orderId)).toBe('CONFIRMED') // order itself unchanged
  })

  it('only staff with the PAYMENTS permission can issue partial refunds', async () => {
    const { co } = await paidOrder()
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: co.orderId } })
    const { actor: noPerm } = await createStaff(['USERS'])
    await expect(createPartialRefund(noPerm, { paymentId: payment.id, amountPaise: 500, reason: 'x' })).rejects.toBeInstanceOf(AppError)
  })
})

describe('"Refunded" only after confirmed bank credit', () => {
  it('needs PROCESSED + staff with evidence; records who and when; then the customer sees "Refunded"', async () => {
    const { actor, user, co } = await paidOrder()
    await cancelOrderAsUser(actor, co.orderId)
    const refund = await refundOf(co.orderId)
    const { actor: staff, user: staffUser } = await createStaff()

    // not yet processed by Razorpay → cannot be confirmed
    await expect(confirmRefundCredited(staff, refund.id, 'Customer bank statement shows credit')).rejects.toBeInstanceOf(AppError)

    const rp = [...fake.refunds.values()][0]
    await deliver(refundEvent('refund.processed', rp, { status: 'processed' }))
    let view = await getUserOrder(user.id, co.orderId)
    expect(view!.refund!.status).toBe('PROCESSED')
    expect(REFUND_LABEL[view!.refund!.status]).toBe('Refund processed')
    expect(REFUND_MESSAGE.PROCESSED).toMatch(/bank may take additional time/)

    // evidence is mandatory, canteen accounts and staff without PAYMENTS cannot confirm
    await expect(confirmRefundCredited(staff, refund.id, 'ok')).rejects.toBeInstanceOf(AppError)
    const { actor: kitchen } = await createCanteen()
    await expect(confirmRefundCredited(kitchen, refund.id, 'Customer bank statement shows credit')).rejects.toBeInstanceOf(AppError)
    const { actor: noPerm } = await createStaff(['USERS'])
    await expect(confirmRefundCredited(noPerm, refund.id, 'Customer bank statement shows credit')).rejects.toBeInstanceOf(AppError)

    await confirmRefundCredited(staff, refund.id, 'Customer sent bank statement showing ₹32 credit, UTR 632221065056')
    const done = await refundOf(co.orderId)
    expect(done.status).toBe('CREDITED')
    expect(done.creditConfirmedById).toBe(staffUser.id)
    expect(done.creditEvidence).toMatch(/UTR/)
    expect(done.creditedAt).not.toBeNull()
    expect(await orderStatus(co.orderId)).toBe('REFUNDED')
    view = await getUserOrder(user.id, co.orderId)
    expect(REFUND_LABEL[view!.refund!.status]).toBe('Refunded')

    // cannot be confirmed twice; a later webhook cannot undo it
    await expect(confirmRefundCredited(staff, refund.id, 'Second confirmation attempt')).rejects.toBeInstanceOf(AppError)
    expect((await deliver(refundEvent('refund.processed', rp, { status: 'processed' }))).body).toBe('refund_already_processed')
    expect((await refundOf(co.orderId)).status).toBe('CREDITED')
  })

  it('refreshing the order page never creates or changes refunds', async () => {
    const { actor, user, co } = await paidOrder()
    await cancelOrderAsUser(actor, co.orderId)
    for (let i = 0; i < 3; i++) await getUserOrder(user.id, co.orderId)
    expect(await prisma.refund.count()).toBe(1)
    expect(fake.refundCalls).toHaveLength(1)
  })
})
