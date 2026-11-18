import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

// ---------------------------------------------------------------------------
// In-memory stand-in for Razorpay's API (no network, no money). It behaves
// like Razorpay Test Mode: orders, payments in created/authorized/captured/
// failed states, capture, refunds.
// ---------------------------------------------------------------------------
type FakePayment = { id: string; order_id: string; status: string; amount: number; currency: string; method: string }
const fake = vi.hoisted(() => ({
  orders: new Map<string, { id: string; amount: number }>(),
  payments: new Map<string, FakePayment>(),
  captures: 0,
  seq: 0,
}))

vi.mock('razorpay', () => ({
  default: class FakeRazorpay {
    orders = {
      create: async (o: { amount: number }) => {
        const id = `order_test${++fake.seq}`
        fake.orders.set(id, { id, amount: o.amount })
        return { id }
      },
      fetchPayments: async (orderId: string) => ({ items: [...fake.payments.values()].filter((p) => p.order_id === orderId) }),
    }
    payments = {
      fetch: async (id: string) => {
        const p = fake.payments.get(id)
        if (!p) throw new Error('The id provided does not exist')
        return p
      },
      capture: async (id: string, amount: number) => {
        const p = fake.payments.get(id)!
        if (p.amount !== amount) throw new Error('Capture amount must be equal to the amount authorized')
        p.status = 'captured'
        fake.captures++
        return p
      },
      refund: async () => ({ id: `rfnd_test${++fake.seq}`, status: 'processed' }),
    }
  },
}))

import { createOrder } from '@/lib/orders/create-order'
import { expireStalePendingOrders } from '@/lib/orders/expire'
import { handleRazorpayWebhook, reconcileRazorpayPayment, verifyRazorpayCheckout } from '@/lib/payments/razorpay-handlers'
import { assertRazorpayModeAllowed, razorpayMode } from '@/lib/payments/gateway'
import { AppError } from '@/lib/errors'
import { createMenu, createUser, prisma, resetDb, setupKitchen, uuid } from '../helpers'

const KEY_SECRET = 'test_key_secret'
const WEBHOOK_SECRET = 'test_webhook_secret'
const checkoutSig = (orderId: string, paymentId: string) =>
  createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')
const webhookSig = (body: string) => createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')

/** What Razorpay Checkout would do after the customer pays with a test UPI ID / card. */
function customerPays(orderId: string, status: 'captured' | 'authorized' | 'failed' | 'created', amount?: number) {
  const id = `pay_test${++fake.seq}`
  fake.payments.set(id, { id, order_id: orderId, status, amount: amount ?? fake.orders.get(orderId)!.amount, currency: 'INR', method: 'upi' })
  return id
}

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
  fake.orders.clear()
  fake.payments.clear()
  fake.captures = 0
})

async function newOrder() {
  const user = await createUser()
  const co = await createOrder(user.actor, { items: [{ foodItemId: menu.samosa.id, quantity: 2 }], idempotencyKey: uuid() })
  return { ...user, co }
}
const orderStatus = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status

describe('Razorpay Test Mode safety', () => {
  it('accepts test keys and refuses live keys unless explicitly allowed', () => {
    expect(razorpayMode('rzp_test_abc')).toBe('test')
    expect(razorpayMode('rzp_live_abc')).toBe('live')
    expect(() => assertRazorpayModeAllowed('rzp_test_abc')).not.toThrow()
    expect(() => assertRazorpayModeAllowed('rzp_live_abc')).toThrow(/LIVE keys/)
    expect(() => assertRazorpayModeAllowed('something_else')).toThrow()
  })

  it('creates a server-side Razorpay order for the exact order total', async () => {
    const { co } = await newOrder()
    expect(co.provider).toBe('RAZORPAY')
    expect(co.razorpayKeyId).toBe('rzp_test_key')
    expect(fake.orders.get(co.gatewayOrderId)!.amount).toBe(co.amountPaise)
    expect(await orderStatus(co.orderId)).toBe('PAYMENT_PENDING')
  })
})

describe('Razorpay checkout verification', () => {
  it('successful payment: confirmed only after signature + server lookup; refresh is harmless', async () => {
    const { actor, co } = await newOrder()
    const pay = customerPays(co.gatewayOrderId, 'captured')
    const body = { razorpay_order_id: co.gatewayOrderId, razorpay_payment_id: pay, razorpay_signature: checkoutSig(co.gatewayOrderId, pay) }
    expect((await verifyRazorpayCheckout(actor, body)).outcome).toBe('confirmed')
    expect(await orderStatus(co.orderId)).toBe('CONFIRMED')
    // Customer refreshes / the callback is sent again
    expect((await verifyRazorpayCheckout(actor, body)).outcome).toBe('already_processed')
    expect(await prisma.pickupToken.count()).toBe(1)
  })

  it('invalid signature is rejected and nothing is confirmed', async () => {
    const { actor, co } = await newOrder()
    const pay = customerPays(co.gatewayOrderId, 'captured')
    await expect(
      verifyRazorpayCheckout(actor, { razorpay_order_id: co.gatewayOrderId, razorpay_payment_id: pay, razorpay_signature: 'a'.repeat(64) }),
    ).rejects.toBeInstanceOf(AppError)
    expect(await orderStatus(co.orderId)).toBe('PAYMENT_PENDING')
    expect(await prisma.auditLog.count({ where: { action: 'payment.invalid_signature' } })).toBe(1)
  })

  it('a valid signature for a payment of ANOTHER order is rejected', async () => {
    const a = await newOrder()
    const b = await newOrder()
    const payB = customerPays(b.co.gatewayOrderId, 'captured')
    // Signature over (orderA, payB) is computable only with the secret; even so the lookup shows payB belongs to order B
    await expect(
      verifyRazorpayCheckout(a.actor, { razorpay_order_id: a.co.gatewayOrderId, razorpay_payment_id: payB, razorpay_signature: checkoutSig(a.co.gatewayOrderId, payB) }),
    ).rejects.toBeInstanceOf(AppError)
    expect(await orderStatus(a.co.orderId)).toBe('PAYMENT_PENDING')
  })

  it('another user cannot verify my order', async () => {
    const { co } = await newOrder()
    const other = await createUser()
    const pay = customerPays(co.gatewayOrderId, 'captured')
    await expect(
      verifyRazorpayCheckout(other.actor, { razorpay_order_id: co.gatewayOrderId, razorpay_payment_id: pay, razorpay_signature: checkoutSig(co.gatewayOrderId, pay) }),
    ).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === 'NOT_FOUND')
  })

  it('authorized (not auto-captured) payment is captured server-side, then confirmed', async () => {
    const { actor, co } = await newOrder()
    const pay = customerPays(co.gatewayOrderId, 'authorized')
    const r = await verifyRazorpayCheckout(actor, { razorpay_order_id: co.gatewayOrderId, razorpay_payment_id: pay, razorpay_signature: checkoutSig(co.gatewayOrderId, pay) })
    expect(r.outcome).toBe('confirmed')
    expect(fake.captures).toBe(1)
  })

  it('incorrect amount is never captured or confirmed', async () => {
    const { actor, co } = await newOrder()
    const pay = customerPays(co.gatewayOrderId, 'authorized', 100) // ₹1 instead of the real total
    const r = await verifyRazorpayCheckout(actor, { razorpay_order_id: co.gatewayOrderId, razorpay_payment_id: pay, razorpay_signature: checkoutSig(co.gatewayOrderId, pay) })
    expect(r.outcome).toBe('rejected')
    expect(fake.captures).toBe(0)
    expect(await orderStatus(co.orderId)).toBe('PAYMENT_PENDING')
  })

  it('failed payment leaves the order unpaid and retryable', async () => {
    const { actor, co } = await newOrder()
    const failed = customerPays(co.gatewayOrderId, 'failed')
    const r = await verifyRazorpayCheckout(actor, { razorpay_order_id: co.gatewayOrderId, razorpay_payment_id: failed, razorpay_signature: checkoutSig(co.gatewayOrderId, failed) })
    expect(r.outcome).toBe('failed')
    expect(await orderStatus(co.orderId)).toBe('PAYMENT_PENDING')
    // Retry in the same Razorpay order succeeds
    const ok = customerPays(co.gatewayOrderId, 'captured')
    expect((await verifyRazorpayCheckout(actor, { razorpay_order_id: co.gatewayOrderId, razorpay_payment_id: ok, razorpay_signature: checkoutSig(co.gatewayOrderId, ok) })).outcome).toBe('confirmed')
  })

  it('pending payment stays pending (not paid) until Razorpay reports it captured', async () => {
    const { actor, co } = await newOrder()
    const pay = customerPays(co.gatewayOrderId, 'created')
    const r = await verifyRazorpayCheckout(actor, { razorpay_order_id: co.gatewayOrderId, razorpay_payment_id: pay, razorpay_signature: checkoutSig(co.gatewayOrderId, pay) })
    expect(r.outcome).toBe('pending')
    expect(await orderStatus(co.orderId)).toBe('PAYMENT_PENDING')
    fake.payments.get(pay)!.status = 'captured'
    const row = await prisma.payment.findFirstOrThrow({ where: { orderId: co.orderId } })
    expect(await reconcileRazorpayPayment(row.id)).toBe('paid')
    expect(await orderStatus(co.orderId)).toBe('CONFIRMED')
  })

  it('cancelled checkout (no payment) is not paid; status check says pending', async () => {
    const { co } = await newOrder()
    const row = await prisma.payment.findFirstOrThrow({ where: { orderId: co.orderId } })
    expect(await reconcileRazorpayPayment(row.id)).toBe('pending')
    expect(await orderStatus(co.orderId)).toBe('PAYMENT_PENDING')
  })

  it('duplicate payment attempt: double-submitting checkout reuses one order and one Razorpay order', async () => {
    const { actor } = await createUser()
    const key = uuid()
    const [a, b] = await Promise.all([
      createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: key }),
      createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: key }),
    ])
    expect(a.orderId).toBe(b.orderId)
    expect(a.gatewayOrderId).toBe(b.gatewayOrderId)
    expect(fake.orders.size).toBe(1)
  })

  it('a second, different captured payment for a paid order is flagged, not double-confirmed', async () => {
    const { actor, co } = await newOrder()
    const p1 = customerPays(co.gatewayOrderId, 'captured')
    await verifyRazorpayCheckout(actor, { razorpay_order_id: co.gatewayOrderId, razorpay_payment_id: p1, razorpay_signature: checkoutSig(co.gatewayOrderId, p1) })
    const p2 = customerPays(co.gatewayOrderId, 'captured')
    const r = await verifyRazorpayCheckout(actor, { razorpay_order_id: co.gatewayOrderId, razorpay_payment_id: p2, razorpay_signature: checkoutSig(co.gatewayOrderId, p2) })
    expect(r.outcome).toBe('rejected')
    expect(await prisma.auditLog.count({ where: { action: 'payment.duplicate_capture' } })).toBe(1)
  })

  it('a missed callback is recovered before the order expires (not wrongly cancelled)', async () => {
    const { co } = await newOrder()
    customerPays(co.gatewayOrderId, 'captured')
    await prisma.order.update({ where: { id: co.orderId }, data: { createdAt: new Date(Date.now() - 60 * 60_000) } })
    await expireStalePendingOrders()
    expect(await orderStatus(co.orderId)).toBe('CONFIRMED')
  })
})

describe('Razorpay webhooks', () => {
  const event = (name: string, entity: Partial<FakePayment>) => JSON.stringify({ event: name, payload: { payment: { entity } } })

  it('rejects invalid signatures', async () => {
    const body = event('payment.captured', { id: 'pay_x', order_id: 'order_x', amount: 100, currency: 'INR' })
    expect((await handleRazorpayWebhook(body, 'deadbeef', 'evt_bad')).status).toBe(400)
    expect((await handleRazorpayWebhook(body, webhookSig(body + 'x'), 'evt_bad')).status).toBe(400)
  })

  it('retries of the same event are processed once', async () => {
    const { co } = await newOrder()
    const pay = customerPays(co.gatewayOrderId, 'captured')
    const body = event('payment.captured', { id: pay, order_id: co.gatewayOrderId, amount: co.amountPaise, currency: 'INR', method: 'upi' })
    const results = await Promise.all([1, 2, 3].map(() => handleRazorpayWebhook(body, webhookSig(body), 'evt_retry')))
    expect(results.filter((r) => r.body === 'confirmed')).toHaveLength(1)
    expect(results.filter((r) => r.body === 'duplicate')).toHaveLength(2)
    // A later redelivery with a new event id is still a no-op
    expect((await handleRazorpayWebhook(body, webhookSig(body), 'evt_retry_2')).body).toBe('already_processed')
    expect(await orderStatus(co.orderId)).toBe('CONFIRMED')
  })

  it('webhook with a wrong amount does not confirm the order', async () => {
    const { co } = await newOrder()
    const body = event('payment.captured', { id: 'pay_wrong', order_id: co.gatewayOrderId, amount: 100, currency: 'INR' })
    expect((await handleRazorpayWebhook(body, webhookSig(body), 'evt_amt')).body).toBe('rejected')
    expect(await orderStatus(co.orderId)).toBe('PAYMENT_PENDING')
  })

  it('payment.failed marks the attempt failed but keeps the order payable', async () => {
    const { co } = await newOrder()
    const body = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_f', order_id: co.gatewayOrderId, error_description: 'Payment failed' } } } })
    expect((await handleRazorpayWebhook(body, webhookSig(body), 'evt_fail')).body).toBe('marked_failed')
    expect((await prisma.payment.findFirstOrThrow({ where: { orderId: co.orderId } })).status).toBe('FAILED')
    expect(await orderStatus(co.orderId)).toBe('PAYMENT_PENDING')
  })

  it('unknown Razorpay order is ignored safely', async () => {
    const body = event('payment.captured', { id: 'pay_u', order_id: 'order_unknown', amount: 100, currency: 'INR' })
    const r = await handleRazorpayWebhook(body, webhookSig(body), 'evt_unknown')
    expect(r.status).toBe(200)
    expect(r.body).toBe('rejected')
  })
})
