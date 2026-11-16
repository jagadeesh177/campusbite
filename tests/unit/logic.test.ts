import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { formatINR, paiseToDecimalString, rupeesToPaise } from '@/lib/money'
import { normalizeCartLines, priceCart } from '@/lib/orders/pricing'
import { allowedTransitions, canTransition } from '@/lib/orders/state-machine'
import { buildPickupQrPayload, generateOrderNumber, generatePickupToken, parsePickupInput, PICKUP_TOKEN_PATTERN } from '@/lib/orders/codes'
import { safeEqualHex, verifyRazorpayCheckoutSignature, verifyRazorpayWebhookSignature } from '@/lib/payments/signatures'
import { isOpenAt, parseHHMM, pickupSlots, zonedMinutesOfDay } from '@/lib/time'

describe('money', () => {
  it('converts DECIMAL strings to paise without float drift', () => {
    expect(rupeesToPaise('40.50')).toBe(4050)
    expect(rupeesToPaise('0.1')).toBe(10)
    expect(rupeesToPaise('110')).toBe(11000)
    expect(rupeesToPaise(19.99)).toBe(1999)
    expect(paiseToDecimalString(4050)).toBe('40.50')
    expect(paiseToDecimalString(5)).toBe('0.05')
  })
  it('formats INR', () => {
    expect(formatINR(4050)).toContain('40.5')
    expect(formatINR(1000)).toContain('₹')
  })
})

describe('cart pricing', () => {
  it('computes subtotal, fee and total from server prices', () => {
    const t = priceCart([{ unitPaise: 1500, quantity: 2 }, { unitPaise: 4050, quantity: 1 }], 200)
    expect(t.lineTotals).toEqual([3000, 4050])
    expect(t.subtotal).toBe(7050)
    expect(t.fees).toBe(200)
    expect(t.total).toBe(7250)
  })
  it('rejects bad quantities, prices and empty carts', () => {
    expect(() => priceCart([], 0)).toThrow()
    expect(() => priceCart([{ unitPaise: 1500, quantity: 0 }], 0)).toThrow()
    expect(() => priceCart([{ unitPaise: 1500, quantity: 11 }], 0)).toThrow()
    expect(() => priceCart([{ unitPaise: 1500, quantity: 1.5 }], 0)).toThrow()
    expect(() => priceCart([{ unitPaise: -1, quantity: 1 }], 0)).toThrow()
    expect(() => priceCart([{ unitPaise: 100, quantity: 1 }], -5)).toThrow()
  })
  it('merges duplicate lines', () => {
    expect(normalizeCartLines([{ foodItemId: 'a', quantity: 1 }, { foodItemId: 'b', quantity: 2 }, { foodItemId: 'a', quantity: 3 }])).toEqual([
      { foodItemId: 'a', quantity: 4 },
      { foodItemId: 'b', quantity: 2 },
    ])
  })
})

describe('order state machine', () => {
  it('only a verified payment (SYSTEM) confirms an order', () => {
    expect(canTransition('PAYMENT_PENDING', 'CONFIRMED', 'SYSTEM')).toBe(true)
    for (const a of ['USER', 'CANTEEN', 'STAFF'] as const) {
      expect(canTransition('PAYMENT_PENDING', 'CONFIRMED', a)).toBe(false)
    }
  })
  it('follows the kitchen happy path in order', () => {
    expect(canTransition('CONFIRMED', 'ACCEPTED', 'CANTEEN')).toBe(true)
    expect(canTransition('ACCEPTED', 'PREPARING', 'CANTEEN')).toBe(true)
    expect(canTransition('PREPARING', 'READY', 'CANTEEN')).toBe(true)
    expect(canTransition('READY', 'COLLECTED', 'CANTEEN')).toBe(true)
  })
  it('blocks skipping steps and users driving the kitchen', () => {
    expect(canTransition('CONFIRMED', 'READY', 'CANTEEN')).toBe(false)
    expect(canTransition('ACCEPTED', 'COLLECTED', 'CANTEEN')).toBe(false)
    expect(canTransition('CONFIRMED', 'ACCEPTED', 'USER')).toBe(false)
    expect(canTransition('READY', 'COLLECTED', 'USER')).toBe(false)
  })
  it('terminal states have no exits', () => {
    expect(allowedTransitions('COLLECTED', 'STAFF')).toEqual([])
    expect(allowedTransitions('REFUNDED', 'STAFF')).toEqual([])
  })
  it('users can cancel only before the kitchen accepts', () => {
    expect(canTransition('PAYMENT_PENDING', 'CANCELLED', 'USER')).toBe(true)
    expect(canTransition('CONFIRMED', 'REFUND_PENDING', 'USER')).toBe(true)
    expect(canTransition('ACCEPTED', 'REFUND_PENDING', 'USER')).toBe(false)
  })
})

describe('codes', () => {
  it('generates readable tokens and order numbers', () => {
    for (let i = 0; i < 200; i++) expect(generatePickupToken()).toMatch(PICKUP_TOKEN_PATTERN)
    expect(generateOrderNumber(new Date('2026-11-15T10:00:00Z'))).toMatch(/^CB-261115-[A-Z0-9]{4}$/)
  })
  it('parses QR payloads and typed tokens, rejects junk', () => {
    const qr = buildPickupQrPayload('CB-261115-7KQX', 'ACDEFG')
    expect(parsePickupInput(qr)).toEqual({ orderNumber: 'CB-261115-7KQX', token: 'ACDEFG' })
    expect(parsePickupInput(' acd efg ')).toEqual({ token: 'ACDEFG' })
    expect(parsePickupInput('ACD-EFG')).toEqual({ token: 'ACDEFG' })
    expect(parsePickupInput('ABC0O1')).toBeNull() // look-alike chars not in alphabet
    expect(parsePickupInput("'; DROP TABLE")).toBeNull()
    expect(parsePickupInput('')).toBeNull()
  })
  it('QR payload never contains payment data', () => {
    expect(buildPickupQrPayload('CB-261115-7KQX', 'ACDEFG')).toBe('CB1:CB-261115-7KQX:ACDEFG')
  })
})

describe('payment signatures', () => {
  const secret = 'shhh-secret'
  it('verifies Razorpay checkout signatures', () => {
    const sig = createHmac('sha256', secret).update('order_1|pay_1').digest('hex')
    expect(verifyRazorpayCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: sig }, secret)).toBe(true)
    expect(verifyRazorpayCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_2', signature: sig }, secret)).toBe(false)
    expect(verifyRazorpayCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: sig }, '')).toBe(false)
    expect(verifyRazorpayCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'nothex' }, secret)).toBe(false)
  })
  it('verifies webhook signatures over the raw body', () => {
    const body = '{"event":"payment.captured"}'
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyRazorpayWebhookSignature(body, sig, secret)).toBe(true)
    expect(verifyRazorpayWebhookSignature(body + ' ', sig, secret)).toBe(false)
    expect(verifyRazorpayWebhookSignature(body, null, secret)).toBe(false)
  })
  it('safeEqualHex handles mismatched lengths', () => {
    expect(safeEqualHex('ab', 'abcd')).toBe(false)
  })
})

describe('time & pickup slots', () => {
  const tz = 'Asia/Kolkata'
  it('computes local minutes in IST', () => {
    // 06:00 UTC = 11:30 IST
    expect(zonedMinutesOfDay(new Date('2026-11-15T06:00:00Z'), tz)).toBe(11 * 60 + 30)
    expect(parseHHMM('08:05')).toBe(485)
    expect(() => parseHHMM('25:00')).toThrow()
  })
  it('checks operating hours', () => {
    expect(isOpenAt(new Date('2026-11-15T06:00:00Z'), tz, '08:00', '20:00')).toBe(true)
    expect(isOpenAt(new Date('2026-11-15T16:00:00Z'), tz, '08:00', '20:00')).toBe(false) // 21:30 IST
  })
  it('generates aligned slots after the prep lead time and before closing', () => {
    const now = new Date('2026-11-15T06:00:00Z') // 11:30 IST
    const slots = pickupSlots({ now, tz, opening: '08:00', closing: '12:31', slotMinutes: 15, leadMinutes: 10 })
    const labels = slots.map((s) => zonedMinutesOfDay(s, tz))
    expect(labels).toEqual([11 * 60 + 45, 12 * 60, 12 * 60 + 15, 12 * 60 + 30])
  })
})

describe('kitchen settings validation', () => {
  it('accepts fees typed with a rupee sign or spaces, and rejects bad hours', async () => {
    const { kitchenSettingsSchema } = await import('@/lib/menu')
    const base = { acceptingOrders: true, pauseMessage: '', defaultPrepMinutes: 12, maxConcurrentOrders: 40, pickupSlotMinutes: 15, openingTime: '08:00', closingTime: '22:00' }
    expect(kitchenSettingsSchema.parse({ ...base, convenienceFee: '₹ 5' }).convenienceFee).toBe('5')
    expect(kitchenSettingsSchema.parse({ ...base, convenienceFee: '2.50' }).convenienceFee).toBe('2.50')
    expect(kitchenSettingsSchema.safeParse({ ...base, convenienceFee: 'five' }).success).toBe(false)
    expect(kitchenSettingsSchema.safeParse({ ...base, convenienceFee: '2', closingTime: '07:00' }).success).toBe(false)
  })
})
