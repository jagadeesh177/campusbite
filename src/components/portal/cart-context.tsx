'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

// The browser cart only stores ids and quantities (plus display hints).
// Prices and availability are always re-checked on the server.

export interface CartLine {
  foodItemId: string
  quantity: number
  name: string
  unitPaise: number
  imageUrl: string | null
  isVeg: boolean
}

interface CartState {
  lines: CartLine[]
  count: number
  checkoutKey: string
  add: (line: Omit<CartLine, 'quantity'>, qty?: number) => void
  setQuantity: (foodItemId: string, quantity: number) => void
  remove: (foodItemId: string) => void
  clear: () => void
  quantityOf: (foodItemId: string) => number
}

const CartContext = createContext<CartState | null>(null)
const MAX_QTY = 10

function newKey() {
  return crypto.randomUUID()
}

export function CartProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const storageKey = `campusbite:cart:${userId}`
  const [lines, setLines] = useState<CartLine[]>([])
  const [checkoutKey, setCheckoutKey] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      const saved = raw ? JSON.parse(raw) : null
      setLines(Array.isArray(saved?.lines) ? saved.lines : [])
      setCheckoutKey(typeof saved?.checkoutKey === 'string' ? saved.checkoutKey : newKey())
    } catch {
      setCheckoutKey(newKey())
    }
    setLoaded(true)
  }, [storageKey])

  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ lines, checkoutKey }))
    } catch {
      /* storage full / private mode — cart still works for this tab */
    }
  }, [lines, checkoutKey, loaded, storageKey])

  // Any change to the cart contents is a new checkout attempt
  const touch = useCallback(() => setCheckoutKey(newKey()), [])

  const add = useCallback(
    (line: Omit<CartLine, 'quantity'>, qty = 1) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.foodItemId === line.foodItemId)
        if (existing) {
          return prev.map((l) =>
            l.foodItemId === line.foodItemId ? { ...l, ...line, quantity: Math.min(MAX_QTY, l.quantity + qty) } : l,
          )
        }
        return [...prev, { ...line, quantity: Math.min(MAX_QTY, qty) }]
      })
      touch()
    },
    [touch],
  )

  const setQuantity = useCallback(
    (foodItemId: string, quantity: number) => {
      setLines((prev) =>
        quantity <= 0
          ? prev.filter((l) => l.foodItemId !== foodItemId)
          : prev.map((l) => (l.foodItemId === foodItemId ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l)),
      )
      touch()
    },
    [touch],
  )

  const remove = useCallback(
    (foodItemId: string) => {
      setLines((prev) => prev.filter((l) => l.foodItemId !== foodItemId))
      touch()
    },
    [touch],
  )

  const clear = useCallback(() => {
    setLines([])
    touch()
  }, [touch])

  const value = useMemo<CartState>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      checkoutKey,
      add,
      setQuantity,
      remove,
      clear,
      quantityOf: (id) => lines.find((l) => l.foodItemId === id)?.quantity ?? 0,
    }),
    [lines, checkoutKey, add, setQuantity, remove, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

const EMPTY: CartState = {
  lines: [],
  count: 0,
  checkoutKey: '',
  add: () => {},
  setQuantity: () => {},
  remove: () => {},
  clear: () => {},
  quantityOf: () => 0,
}

/** Outside the student portal there is no cart; components get an inert one. */
export function useCart(): CartState {
  return useContext(CartContext) ?? EMPTY
}
