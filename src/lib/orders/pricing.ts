// Cart pricing (pure). Inputs are server-side prices in paise — the client
// never supplies prices or totals.

import type { Paise } from '@/lib/money'

export const MAX_ITEM_QUANTITY = 10
export const MAX_CART_LINES = 15

export interface PricedLine {
  unitPaise: Paise
  quantity: number
}

export interface CartTotals {
  lineTotals: Paise[]
  subtotal: Paise
  fees: Paise
  total: Paise
}

export function priceCart(lines: PricedLine[], convenienceFeePaise: Paise): CartTotals {
  if (lines.length === 0) throw new Error('Cart is empty')
  if (lines.length > MAX_CART_LINES) throw new Error('Too many items in cart')
  if (!Number.isInteger(convenienceFeePaise) || convenienceFeePaise < 0) {
    throw new Error('Invalid fee')
  }
  const lineTotals = lines.map((l) => {
    if (!Number.isInteger(l.unitPaise) || l.unitPaise <= 0) throw new Error('Invalid price')
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_ITEM_QUANTITY) {
      throw new Error('Invalid quantity')
    }
    return l.unitPaise * l.quantity
  })
  const subtotal = lineTotals.reduce((a, b) => a + b, 0)
  const fees = convenienceFeePaise
  return { lineTotals, subtotal, fees, total: subtotal + fees }
}

/** Merge duplicate lines from a client cart, preserving first-seen order. */
export function normalizeCartLines<T extends { foodItemId: string; quantity: number }>(
  lines: T[],
): { foodItemId: string; quantity: number }[] {
  const map = new Map<string, number>()
  for (const l of lines) map.set(l.foodItemId, (map.get(l.foodItemId) ?? 0) + l.quantity)
  return [...map.entries()].map(([foodItemId, quantity]) => ({ foodItemId, quantity }))
}
