'use client'

import type { CheckoutSession } from '@/lib/orders/create-order'

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void }
  }
}

/** 10-digit Indian mobile as +91XXXXXXXXXX, or null if it isn't one. */
export function toIndianMobile(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits
  return /^[6-9]\d{9}$/.test(ten) ? `+91${ten}` : null
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
  prefill: { name: string; email: string; contact?: string | null },
): Promise<'verified' | 'pending' | 'dismissed'> {
  const contact = toIndianMobile(prefill.contact)
  await loadScript()
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: session.razorpayKeyId,
      amount: session.amountPaise,
      currency: 'INR',
      order_id: session.gatewayOrderId,
      // Close the checkout when the order's 30-minute payment window ends
      timeout: Math.max(60, Math.floor((new Date(session.payBy).getTime() - Date.now()) / 1000)),
      name: 'CampusBite',
      description: `Order ${session.orderNumber}`,
      prefill: { name: prefill.name, email: prefill.email, ...(contact ? { contact } : {}) },
      // We already know the customer's email and mobile: skip Razorpay's contact step
      ...(contact ? { readonly: { email: true, contact: true }, hidden: { email: true, contact: true } } : {}),
      theme: { color: '#173F35' },
      // UPI first: on phones Razorpay lists the UPI apps installed on the
      // device (GPay, PhonePe, Paytm, BHIM…) and opens the chosen one directly;
      // on laptops it shows a UPI QR code to scan. Other methods stay below.
      config: {
        display: {
          blocks: {
            upi: {
              name: 'Pay using any UPI app',
              instruments: [{ method: 'upi', flows: ['intent', 'qr', 'collect'] }],
            },
          },
          sequence: ['block.upi'],
          preferences: { show_default_blocks: true },
        },
      },
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
