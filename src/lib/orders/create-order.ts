import 'server-only'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { getKitchenSettings, kitchenStatus, type KitchenStatus } from '@/lib/kitchen'
import { paiseToDecimalString, rupeesToPaise, type Paise } from '@/lib/money'
import { pickupSlots } from '@/lib/time'
import { withTxRetry, isUniqueViolation } from '@/lib/tx'
import type { Actor } from '@/lib/auth/guards'
import { getActiveGateway } from '@/lib/payments/gateway'
import { generateOrderNumber } from './codes'
import { recordStatusChange } from './events'
import { expireStalePendingOrders } from './expire'
import { MAX_CART_LINES, MAX_ITEM_QUANTITY, normalizeCartLines, priceCart } from './pricing'

export const cartLinesSchema = z
  .array(
    z.object({
      foodItemId: z.string().min(1).max(40),
      quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
    }),
  )
  .min(1, 'Your cart is empty')
  .max(MAX_CART_LINES)

export const createOrderSchema = z.object({
  items: cartLinesSchema,
  idempotencyKey: z.string().uuid(),
  pickupSlot: z.string().datetime().nullish(),
})

const ACTIVE_KITCHEN_STATUSES = ['CONFIRMED', 'ACCEPTED', 'PREPARING'] as const

// ---------------------------------------------------------------------------
// Quote: read-only, server-priced view of a cart (cart + checkout pages)
// ---------------------------------------------------------------------------

export interface CartQuoteLine {
  foodItemId: string
  name: string
  imageUrl: string | null
  isVeg: boolean
  quantity: number
  unitPaise: Paise
  lineTotalPaise: Paise
  available: boolean
}

export interface CartQuote {
  lines: CartQuoteLine[]
  subtotal: Paise
  fees: Paise
  total: Paise
  hasUnavailable: boolean
  kitchen: KitchenStatus
  estimatedPrepMinutes: number
  pickupSlots: string[]
}

export async function quoteCart(rawLines: { foodItemId: string; quantity: number }[]): Promise<CartQuote> {
  const settings = await getKitchenSettings()
  const kitchen = kitchenStatus(settings)
  const parsed = cartLinesSchema.safeParse(normalizeCartLines(rawLines))
  const lines = parsed.success ? parsed.data : []

  const items = lines.length
    ? await db.foodItem.findMany({
        where: { id: { in: lines.map((l) => l.foodItemId) } },
        include: { category: { select: { isActive: true } } },
      })
    : []
  const byId = new Map(items.map((i) => [i.id, i]))

  const quoteLines: CartQuoteLine[] = []
  for (const l of lines) {
    const item = byId.get(l.foodItemId)
    if (!item) continue // deleted item — silently dropped from the quote
    const unitPaise = rupeesToPaise(item.price)
    quoteLines.push({
      foodItemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      isVeg: item.isVeg,
      quantity: l.quantity,
      unitPaise,
      lineTotalPaise: unitPaise * l.quantity,
      available: item.isAvailable && item.category.isActive,
    })
  }

  const payable = quoteLines.filter((l) => l.available)
  const totals = payable.length
    ? priceCart(payable.map((l) => ({ unitPaise: l.unitPaise, quantity: l.quantity })), rupeesToPaise(settings.convenienceFee))
    : { subtotal: 0, fees: 0, total: 0 }

  const prep = Math.max(settings.defaultPrepMinutes, ...items.map((i) => i.prepTimeMinutes), 0)
  return {
    lines: quoteLines,
    subtotal: totals.subtotal,
    fees: totals.fees,
    total: totals.total,
    hasUnavailable: quoteLines.some((l) => !l.available),
    kitchen,
    estimatedPrepMinutes: prep,
    pickupSlots: pickupSlots({
      now: new Date(),
      tz: env.timezone,
      opening: settings.openingTime,
      closing: settings.closingTime,
      slotMinutes: settings.pickupSlotMinutes,
      leadMinutes: prep,
    }).map((d) => d.toISOString()),
  }
}

// ---------------------------------------------------------------------------
// Create order + start payment
// ---------------------------------------------------------------------------

export interface CheckoutSession {
  orderId: string
  orderNumber: string
  paymentId: string
  provider: 'RAZORPAY' | 'SIMULATOR'
  gatewayOrderId: string
  amountPaise: Paise
  razorpayKeyId: string | null
}

async function checkoutFor(orderId: string): Promise<CheckoutSession> {
  // A concurrent duplicate request may arrive before the winner has created
  // the payment row (gateway call in flight) — wait briefly for it.
  let order
  for (let attempt = 0; ; attempt++) {
    order = await db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (order.payments.length || order.status !== 'PAYMENT_PENDING' || attempt >= 15) break
    await new Promise((r) => setTimeout(r, 200))
  }
  const payment = order.payments[0]
  if (!payment) throw new AppError('PAYMENT', 'Payment could not be started for this order.')
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentId: payment.id,
    provider: payment.provider,
    gatewayOrderId: payment.gatewayOrderId,
    amountPaise: rupeesToPaise(payment.amount),
    razorpayKeyId: payment.provider === 'RAZORPAY' ? env.razorpay.keyId : null,
  }
}

export async function createOrder(
  actor: Actor,
  input: z.input<typeof createOrderSchema>,
): Promise<CheckoutSession> {
  if (actor.role !== 'STUDENT') throw new AppError('FORBIDDEN', 'Only students can place orders.')
  const parsed = createOrderSchema.safeParse({ ...input, items: normalizeCartLines(input.items ?? []) })
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid order')
  const { items: lines, idempotencyKey, pickupSlot } = parsed.data

  // Same checkout attempt submitted twice (double click, retry, two tabs) → same order
  const existing = await db.order.findUnique({
    where: { userId_idempotencyKey: { userId: actor.userId, idempotencyKey } },
  })
  if (existing) {
    if (existing.status !== 'PAYMENT_PENDING') {
      throw new AppError('CONFLICT', `This checkout was already completed as order ${existing.orderNumber}.`)
    }
    return checkoutFor(existing.id)
  }

  await expireStalePendingOrders()

  const settings = await getKitchenSettings()
  const kitchen = kitchenStatus(settings)
  if (!kitchen.open) throw new AppError('UNAVAILABLE', kitchen.message ?? 'Ordering is closed right now.')

  // Abuse guard: unpaid orders a student may have open at once
  const openUnpaid = await db.order.count({
    where: { userId: actor.userId, status: 'PAYMENT_PENDING' },
  })
  if (openUnpaid >= 3) {
    throw new AppError('RATE_LIMITED', 'You have unpaid orders open. Pay or cancel them before placing a new one.')
  }

  let order: { id: string; orderNumber: string; total: Prisma.Decimal; userId: string }
  try {
    order = await withTxRetry(() =>
      db.$transaction(
        async (tx) => {
          const items = await tx.foodItem.findMany({
            where: { id: { in: lines.map((l) => l.foodItemId) } },
            include: { category: { select: { isActive: true } } },
          })
          const byId = new Map(items.map((i) => [i.id, i]))
          for (const l of lines) {
            const item = byId.get(l.foodItemId)
            if (!item) throw new AppError('UNAVAILABLE', 'An item in your cart is no longer on the menu.')
            if (!item.isAvailable || !item.category.isActive) {
              throw new AppError('UNAVAILABLE', `${item.name} just sold out. Please update your cart.`)
            }
          }

          const inKitchen = await tx.order.count({
            where: { status: { in: [...ACTIVE_KITCHEN_STATUSES] } },
          })
          if (inKitchen >= settings.maxConcurrentOrders) {
            throw new AppError('UNAVAILABLE', 'The kitchen is at full capacity. Please try again in a few minutes.')
          }

          // Prices come from the database, never from the client
          const priced = lines.map((l) => {
            const item = byId.get(l.foodItemId)!
            return { item, quantity: l.quantity, unitPaise: rupeesToPaise(item.price) }
          })
          const totals = priceCart(
            priced.map((p) => ({ unitPaise: p.unitPaise, quantity: p.quantity })),
            rupeesToPaise(settings.convenienceFee),
          )

          const now = new Date()
          const prep = Math.max(settings.defaultPrepMinutes, ...priced.map((p) => p.item.prepTimeMinutes))
          let pickupSlotStart: Date | null = null
          if (pickupSlot) {
            const wanted = new Date(pickupSlot).getTime()
            const valid = pickupSlots({
              now,
              tz: env.timezone,
              opening: settings.openingTime,
              closing: settings.closingTime,
              slotMinutes: settings.pickupSlotMinutes,
              leadMinutes: prep,
            }).find((s) => Math.abs(s.getTime() - wanted) < 60_000)
            if (!valid) throw new AppError('VALIDATION', 'That pickup slot is no longer available. Please pick another.')
            pickupSlotStart = valid
          }

          const created = await tx.order.create({
            data: {
              orderNumber: generateOrderNumber(now),
              userId: actor.userId,
              idempotencyKey,
              status: 'PAYMENT_PENDING',
              subtotal: paiseToDecimalString(totals.subtotal),
              fees: paiseToDecimalString(totals.fees),
              total: paiseToDecimalString(totals.total),
              pickupSlotStart,
              estimatedReadyAt: pickupSlotStart ?? new Date(now.getTime() + prep * 60_000),
              items: {
                create: priced.map((p, idx) => ({
                  foodItemId: p.item.id,
                  nameSnapshot: p.item.name,
                  unitPrice: paiseToDecimalString(p.unitPaise),
                  quantity: p.quantity,
                  lineTotal: paiseToDecimalString(totals.lineTotals[idx]),
                })),
              },
            },
          })
          await recordStatusChange(tx, {
            order: created,
            from: null,
            to: 'PAYMENT_PENDING',
            actorKind: 'STUDENT',
            actorUserId: actor.userId,
          })
          return created
        },
        { isolationLevel: 'Serializable' },
      ),
    )
  } catch (e) {
    // A concurrent request with the same idempotency key won the race
    if (isUniqueViolation(e, 'idempotencyKey')) {
      const winner = await db.order.findUniqueOrThrow({
        where: { userId_idempotencyKey: { userId: actor.userId, idempotencyKey } },
      })
      return checkoutFor(winner.id)
    }
    throw e
  }

  // Start the payment with the gateway (outside the DB transaction: network call)
  try {
    const gateway = getActiveGateway()
    const { gatewayOrderId } = await gateway.createOrder({
      amountPaise: rupeesToPaise(order.total),
      receipt: order.orderNumber,
      notes: { orderId: order.id },
    })
    await db.payment.create({
      data: {
        orderId: order.id,
        provider: gateway.provider,
        amount: order.total,
        currency: 'INR',
        gatewayOrderId,
      },
    })
  } catch (e) {
    console.error('[checkout] payment initiation failed', e)
    await db.$transaction(async (tx) => {
      const r = await tx.order.updateMany({
        where: { id: order.id, status: 'PAYMENT_PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Payment could not be started' },
      })
      if (r.count) {
        await recordStatusChange(tx, {
          order,
          from: 'PAYMENT_PENDING',
          to: 'CANCELLED',
          actorKind: 'SYSTEM',
          note: 'Payment could not be started',
        })
      }
    })
    throw new AppError('PAYMENT', 'We could not start the payment. You have not been charged. Please try again.')
  }

  return checkoutFor(order.id)
}

/** Resume payment for one of the student's own unpaid orders. */
export async function getCheckoutSession(actor: Actor, orderId: string): Promise<CheckoutSession> {
  const order = await db.order.findFirst({ where: { id: orderId, userId: actor.userId } })
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.')
  if (order.status !== 'PAYMENT_PENDING') throw new AppError('CONFLICT', 'This order no longer needs payment.')
  return checkoutFor(order.id)
}
