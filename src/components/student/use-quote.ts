'use client'

import { useEffect, useState } from 'react'
import { quoteCartAction } from '@/app/actions/student'
import { useCart } from '@/components/portal/cart-context'
import type { CartQuote } from '@/lib/orders/create-order'

/** Re-prices the browser cart on the server whenever it changes. */
export function useServerQuote() {
  const cart = useCart()
  const [quote, setQuote] = useState<CartQuote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const key = cart.lines.map((l) => `${l.foodItemId}:${l.quantity}`).join(',')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      const r = await quoteCartAction(cart.lines.map((l) => ({ foodItemId: l.foodItemId, quantity: l.quantity })))
      if (cancelled) return
      if (r.ok) {
        setQuote(r.data)
        setError(null)
      } else setError(r.error)
      setLoading(false)
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { quote, error, loading }
}
