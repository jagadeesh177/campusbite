import { createHmac, timingSafeEqual } from 'node:crypto'

function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

/** Constant-time comparison of two hex strings. */
export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

/** Razorpay Checkout: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret) */
export function verifyRazorpayCheckoutSignature(
  p: { orderId: string; paymentId: string; signature: string },
  keySecret: string,
): boolean {
  if (!keySecret) return false
  return safeEqualHex(hmacHex(keySecret, `${p.orderId}|${p.paymentId}`), p.signature)
}

/** Razorpay webhooks: X-Razorpay-Signature = HMAC_SHA256(raw request body, webhook_secret) */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string,
): boolean {
  if (!webhookSecret || !signature) return false
  return safeEqualHex(hmacHex(webhookSecret, rawBody), signature)
}

/** Development simulator signs its "gateway callback" the same way a gateway would. */
export function signSimulatorPayload(payload: object, secret: string): string {
  return hmacHex(secret, JSON.stringify(payload))
}

export function verifySimulatorSignature(payload: object, signature: string, secret: string): boolean {
  return safeEqualHex(signSimulatorPayload(payload, secret), signature)
}
