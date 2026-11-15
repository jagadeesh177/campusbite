'use client'

import type { CheckoutSession } from '@/lib/orders/create-order'

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void }
  }
}

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'))
    document.body.appendChild(s)
  })
}

/**
 * Opens Razorpay Checkout (UPI and other methods enabled on the merchant
 * account). The browser result is only a hint — it is sent to our server,
 * which verifies the signature and re-fetches the payment from Razorpay.
 */
export async function payWithRazorpay(
  session: CheckoutSession,
  prefill: { name: string; email: string },
): Promise<'verified' | 'pending' | 'dismissed'> {
  await loadScript()
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: session.razorpayKeyId,
      amount: session.amountPaise,
      currency: 'INR',
      order_id: session.gatewayOrderId,
      name: 'CampusBite',
      description: `Order ${session.orderNumber}`,
      prefill,
      theme: { color: '#173F35' },
      handler: async (resp: Record<string, string>) => {
        try {
          const r = await fetch('/api/payments/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(resp),
          })
          const data = await r.json()
          if (!r.ok) return reject(new Error(data.error ?? 'Payment verification failed'))
          resolve(data.outcome === 'pending' ? 'pending' : 'verified')
        } catch {
          // Network blip after paying: the webhook will still confirm the order
          resolve('pending')
        }
      },
      modal: { ondismiss: () => resolve('dismissed') },
    })
    rzp.open()
  })
}
