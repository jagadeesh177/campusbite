import { beforeEach, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { createOrder } from '@/lib/orders/create-order'
import { changeOrderStatus, cancelOrderAsUser } from '@/lib/orders/transitions'
import { completePickup, lookupPickup } from '@/lib/orders/pickup'
import { expireStalePendingOrders } from '@/lib/orders/expire'
import { confirmPayment } from '@/lib/payments/confirm'
import { simulatePayment } from '@/lib/payments/simulator'
import { processRefund } from '@/lib/payments/refunds'
import { handleRazorpayWebhook } from '@/lib/payments/razorpay-handlers'
import { buildPickupQrPayload } from '@/lib/orders/codes'
import { AppError } from '@/lib/errors'
import { createCanteen, createMenu, createStaff, createUser, prisma, resetDb, setupKitchen, uuid } from '../helpers'

let menu: Awaited<ReturnType<typeof createMenu>>

beforeEach(async () => {
  await resetDb()
  await setupKitchen()
  menu = await createMenu()
})

async function paidOrder(actor: Awaited<ReturnType<typeof createUser>>['actor']) {
  const co = await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 2 }], idempotencyKey: uuid() })
  const r = await simulatePayment(actor, co.paymentId, 'success')
  expect(r.outcome).toBe('confirmed')
  return co
}

async function expectAppError(p: Promise<unknown>, code: AppError['code']) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

describe('order creation', () => {
  it('prices from the database, ignoring anything the client might send', async () => {
    const { actor } = await createUser()
    const co = await createOrder(actor, {
      items: [
        { foodItemId: menu.samosa.id, quantity: 2, price: 1 } as never,
        { foodItemId: menu.sandwich.id, quantity: 1 },
      ],
      idempotencyKey: uuid(),
    })
    const order = await prisma.order.findUniqueOrThrow({ where: { id: co.orderId }, include: { items: true } })
    expect(order.subtotal.toString()).toBe('70.5') // 2×15 + 40.50
    expect(order.fees.toString()).toBe('2')
    expect(co.amountPaise).toBe(7250)
    expect(order.status).toBe('PAYMENT_PENDING')
    expect(order.items.map((i) => i.nameSnapshot).sort()).toEqual(['Samosa', 'Veg Sandwich'])
  })

  it('rejects sold-out items, non-users, and a paused kitchen', async () => {
    const { actor } = await createUser()
    await expectAppError(
      createOrder(actor, { items: [{ foodItemId: menu.soldOut.id, quantity: 1 }], idempotencyKey: uuid() }),
      'UNAVAILABLE',
    )
    const { actor: canteen } = await createCanteen()
    await expectAppError(
      createOrder(canteen, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() }),
      'FORBIDDEN',
    )
    await prisma.kitchenSettings.update({ where: { id: 'default' }, data: { acceptingOrders: false } })
    await expectAppError(
      createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() }),
      'UNAVAILABLE',
    )
  })

  it('is idempotent under simultaneous duplicate submissions', async () => {
    const { actor, user } = await createUser()
    const key = uuid()
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: key }),
      ),
    )
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1)
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1)
    expect(await prisma.payment.count()).toBe(1)
  })

  it('handles many users ordering at the same moment', async () => {
    const users = await Promise.all(Array.from({ length: 8 }, () => createUser()))
    const results = await Promise.allSettled(
      users.map((s) =>
        createOrder(s.actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() }),
      ),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(8)
    expect(await prisma.order.count()).toBe(8)
  })

  it('enforces kitchen capacity on confirmed orders', async () => {
    await prisma.kitchenSettings.update({ where: { id: 'default' }, data: { maxConcurrentOrders: 1 } })
    const a = await createUser()
    await paidOrder(a.actor)
    const b = await createUser()
    await expectAppError(
      createOrder(b.actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() }),
      'UNAVAILABLE',
    )
  })
})

describe('payment verification', () => {
  it('confirms the order and issues a pickup token', async () => {
    const { actor } = await createUser()
    const co = await paidOrder(actor)
    const order = await prisma.order.findUniqueOrThrow({ where: { id: co.orderId }, include: { pickupToken: true, payments: true } })
    expect(order.status).toBe('CONFIRMED')
    expect(order.pickupToken?.token).toHaveLength(6)
    expect(order.payments[0].status).toBe('SUCCEEDED')
    expect(await prisma.realtimeEvent.count({ where: { orderId: co.orderId, forCanteen: true } })).toBeGreaterThan(0)
  })

  it('is idempotent when the same payment is reported concurrently', async () => {
    const { actor } = await createUser()
    const co = await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    const input = { gatewayOrderId: co.gatewayOrderId, gatewayPaymentId: 'pay_X', amountPaise: co.amountPaise, currency: 'INR', verifiedVia: 'webhook' as const }
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => confirmPayment(input)))
    expect(outcomes.filter((o) => o.outcome === 'confirmed')).toHaveLength(1)
    expect(outcomes.filter((o) => o.outcome === 'already_processed')).toHaveLength(4)
    expect(await prisma.pickupToken.count()).toBe(1)
    expect(await prisma.orderStatusHistory.count({ where: { orderId: co.orderId, toStatus: 'CONFIRMED' } })).toBe(1)
  })

  it('rejects an amount or currency mismatch (fake confirmation)', async () => {
    const { actor } = await createUser()
    const co = await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    const r = await confirmPayment({ gatewayOrderId: co.gatewayOrderId, gatewayPaymentId: 'pay_cheap', amountPaise: 100, currency: 'INR', verifiedVia: 'webhook' })
    expect(r).toMatchObject({ outcome: 'rejected', reason: 'amount_mismatch' })
    expect((await prisma.order.findUniqueOrThrow({ where: { id: co.orderId } })).status).toBe('PAYMENT_PENDING')
  })

  it('a user cannot pay/confirm someone else\'s order', async () => {
    const a = await createUser()
    const b = await createUser()
    const co = await createOrder(a.actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    await expectAppError(simulatePayment(b.actor, co.paymentId, 'success'), 'NOT_FOUND')
  })

  it('a failed payment leaves the order retryable', async () => {
    const { actor } = await createUser()
    const co = await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    expect((await simulatePayment(actor, co.paymentId, 'failure')).outcome).toBe('failed')
    expect((await prisma.order.findUniqueOrThrow({ where: { id: co.orderId } })).status).toBe('PAYMENT_PENDING')
    expect((await simulatePayment(actor, co.paymentId, 'success')).outcome).toBe('confirmed')
  })

  it('refunds a payment that arrives after the order expired', async () => {
    const { actor } = await createUser()
    const co = await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    await prisma.order.update({ where: { id: co.orderId }, data: { createdAt: new Date(Date.now() - 60 * 60_000) } })
    expect(await expireStalePendingOrders()).toBe(1)
    const r = await confirmPayment({ gatewayOrderId: co.gatewayOrderId, gatewayPaymentId: 'pay_late', amountPaise: co.amountPaise, currency: 'INR', verifiedVia: 'webhook' })
    expect(r.outcome).toBe('refund_required')
    const order = await prisma.order.findUniqueOrThrow({ where: { id: co.orderId }, include: { refunds: true } })
    expect(order.status).toBe('REFUNDED')
    expect(order.refunds[0].status).toBe('PROCESSED')
  })
})

describe('razorpay webhook', () => {
  const sign = (body: string) => createHmac('sha256', 'test_webhook_secret').update(body).digest('hex')

  it('rejects unsigned / tampered webhooks', async () => {
    expect((await handleRazorpayWebhook('{}', 'bad', 'evt_1')).status).toBe(400)
    expect((await handleRazorpayWebhook('{}', null, 'evt_1')).status).toBe(400)
  })

  it('processes a delivery once, even when retried', async () => {
    const { actor } = await createUser()
    const co = await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_wh', order_id: co.gatewayOrderId, amount: co.amountPaise, currency: 'INR', method: 'upi' } } },
    })
    const [a, b, c] = await Promise.all([
      handleRazorpayWebhook(body, sign(body), 'evt_dup'),
      handleRazorpayWebhook(body, sign(body), 'evt_dup'),
      handleRazorpayWebhook(body, sign(body), 'evt_dup'),
    ])
    expect([a, b, c].filter((r) => r.body === 'confirmed')).toHaveLength(1)
    expect([a, b, c].filter((r) => r.body === 'duplicate')).toHaveLength(2)
    expect(await prisma.webhookEvent.count()).toBe(1)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: co.orderId } })).status).toBe('CONFIRMED')
  })
})

describe('status transitions & refunds', () => {
  it('canteen moves a paid order through the kitchen', async () => {
    const { actor } = await createUser()
    const { actor: kitchen } = await createCanteen()
    const co = await paidOrder(actor)
    for (const to of ['ACCEPTED', 'PREPARING', 'READY'] as const) {
      expect((await changeOrderStatus(kitchen, { orderId: co.orderId, to })).status).toBe(to)
    }
  })

  it('blocks skipped steps, unauthorized roles and missing permissions', async () => {
    const { actor } = await createUser()
    const { actor: kitchen } = await createCanteen()
    const { actor: cashierOnlyMenu } = await createCanteen(['MENU'])
    const co = await paidOrder(actor)
    await expectAppError(changeOrderStatus(kitchen, { orderId: co.orderId, to: 'READY' }), 'CONFLICT')
    await expectAppError(changeOrderStatus(actor, { orderId: co.orderId, to: 'ACCEPTED' }), 'CONFLICT')
    await expectAppError(changeOrderStatus(cashierOnlyMenu, { orderId: co.orderId, to: 'ACCEPTED' }), 'FORBIDDEN')
    await expectAppError(changeOrderStatus(kitchen, { orderId: co.orderId, to: 'COLLECTED' }), 'VALIDATION')
    await expectAppError(changeOrderStatus(kitchen, { orderId: co.orderId, to: 'CONFIRMED' }), 'VALIDATION')
  })

  it('unpaid orders cannot be prepared', async () => {
    const { actor } = await createUser()
    const { actor: kitchen } = await createCanteen()
    const co = await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    await expectAppError(changeOrderStatus(kitchen, { orderId: co.orderId, to: 'ACCEPTED' }), 'CONFLICT')
  })

  it('only one of two simultaneous kitchen updates wins', async () => {
    const { actor } = await createUser()
    const k1 = await createCanteen()
    const k2 = await createCanteen()
    const co = await paidOrder(actor)
    const r = await Promise.allSettled([
      changeOrderStatus(k1.actor, { orderId: co.orderId, to: 'ACCEPTED' }),
      changeOrderStatus(k2.actor, { orderId: co.orderId, to: 'ACCEPTED' }),
    ])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
  })

  it('rejecting a paid order triggers an automatic refund', async () => {
    const { actor } = await createUser()
    const { actor: kitchen } = await createCanteen()
    const co = await paidOrder(actor)
    await expectAppError(changeOrderStatus(kitchen, { orderId: co.orderId, to: 'REFUND_PENDING' }), 'VALIDATION') // reason required
    const r = await changeOrderStatus(kitchen, { orderId: co.orderId, to: 'REFUND_PENDING', reason: 'Out of samosas' })
    expect(r.refund).toBe('processed')
    const order = await prisma.order.findUniqueOrThrow({ where: { id: co.orderId }, include: { refunds: true, payments: true } })
    expect(order.status).toBe('REFUNDED')
    expect(order.payments[0].status).toBe('REFUNDED')
    expect(await prisma.auditLog.count({ where: { action: 'refund.processed' } })).toBe(1)
  })

  it('a refund is sent to the gateway at most once under concurrent clicks', async () => {
    const { actor } = await createUser()
    const { actor: staff } = await createStaff(['PAYMENTS'])
    const co = await paidOrder(actor)
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: co.orderId } })
    await prisma.order.update({ where: { id: co.orderId }, data: { status: 'REFUND_PENDING' } })
    const refund = await prisma.refund.create({ data: { orderId: co.orderId, paymentId: payment.id, amount: payment.amount, reason: 'test' } })
    const results = await Promise.allSettled([processRefund(refund.id, staff), processRefund(refund.id, staff), processRefund(refund.id, staff)])
    expect(results.filter((r) => r.status === 'fulfilled' && r.value === 'processed')).toHaveLength(1)
    expect(await prisma.auditLog.count({ where: { action: 'refund.processed' } })).toBe(1)
  })

  it('users cancel unpaid orders, get refunds before acceptance, and cannot cancel later', async () => {
    const s = await createUser()
    const other = await createUser()
    const { actor: kitchen } = await createCanteen()

    const unpaid = await createOrder(s.actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    await expectAppError(cancelOrderAsUser(other.actor, unpaid.orderId), 'NOT_FOUND') // IDOR
    expect((await cancelOrderAsUser(s.actor, unpaid.orderId)).status).toBe('CANCELLED')

    const paid = await paidOrder(s.actor)
    expect((await cancelOrderAsUser(s.actor, paid.orderId)).refund).toBe('processed')

    const accepted = await paidOrder(s.actor)
    await changeOrderStatus(kitchen, { orderId: accepted.orderId, to: 'ACCEPTED' })
    await expectAppError(cancelOrderAsUser(s.actor, accepted.orderId), 'CONFLICT')
  })
})

describe('pickup verification', () => {
  async function readyOrder() {
    const s = await createUser()
    const k = await createCanteen()
    const co = await paidOrder(s.actor)
    for (const to of ['ACCEPTED', 'PREPARING', 'READY'] as const) await changeOrderStatus(k.actor, { orderId: co.orderId, to })
    const token = (await prisma.pickupToken.findUniqueOrThrow({ where: { orderId: co.orderId } })).token
    return { co, token, kitchen: k.actor }
  }

  it('collects a READY order exactly once', async () => {
    const { co, token, kitchen } = await readyOrder()
    const preview = await lookupPickup(kitchen, buildPickupQrPayload(co.orderNumber, token))
    expect(preview.canCollect).toBe(true)
    expect((await completePickup(kitchen, token)).orderNumber).toBe(co.orderNumber)
    await expectAppError(completePickup(kitchen, token), 'CONFLICT') // token reuse
    expect((await lookupPickup(kitchen, token)).canCollect).toBe(false)
  })

  it('simultaneous scans cannot both hand over the order', async () => {
    const { token, kitchen } = await readyOrder()
    const r = await Promise.allSettled([completePickup(kitchen, token), completePickup(kitchen, token), completePickup(kitchen, token)])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
  })

  it('refuses orders that are not ready, mismatched QR codes and other roles', async () => {
    const s = await createUser()
    const { actor: kitchen } = await createCanteen()
    const { actor: menuOnly } = await createCanteen(['MENU'])
    const co = await paidOrder(s.actor)
    const token = (await prisma.pickupToken.findUniqueOrThrow({ where: { orderId: co.orderId } })).token
    await expectAppError(completePickup(kitchen, token), 'CONFLICT')
    await expectAppError(lookupPickup(kitchen, buildPickupQrPayload('CB-261115-AAAA', token)), 'VALIDATION')
    await expectAppError(lookupPickup(menuOnly, token), 'FORBIDDEN')
    await expectAppError(lookupPickup(s.actor, token), 'FORBIDDEN')
    await expectAppError(lookupPickup(kitchen, 'garbage'), 'VALIDATION')
  })
})
