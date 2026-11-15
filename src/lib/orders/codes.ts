import { randomInt } from 'node:crypto'

// Human-friendly identifiers. Alphabet avoids look-alike characters
// (0/O, 1/I/L, 5/S, 8/B, 2/Z) so tokens are easy to read out at the counter.
const ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679'

function randomCode(length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

/** e.g. CB-261115-7KQX — unique constraint in DB; callers retry on collision. */
export function generateOrderNumber(now = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(-2)
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  return `CB-${yy}${mm}${dd}-${randomCode(4)}`
}

export const PICKUP_TOKEN_LENGTH = 6

export function generatePickupToken(): string {
  return randomCode(PICKUP_TOKEN_LENGTH)
}

export const PICKUP_TOKEN_PATTERN = new RegExp(`^[${ALPHABET}]{${PICKUP_TOKEN_LENGTH}}$`)

/** QR payload carries only the order number and pickup token — never payment data. */
export function buildPickupQrPayload(orderNumber: string, token: string): string {
  return `CB1:${orderNumber}:${token}`
}

/** Accepts a scanned QR payload or a manually typed token. */
export function parsePickupInput(raw: string): { token: string; orderNumber?: string } | null {
  const s = raw.trim().toUpperCase()
  const qr = /^CB1:(CB-\d{6}-[A-Z0-9]{4}):([A-Z0-9]+)$/.exec(s)
  if (qr) {
    return PICKUP_TOKEN_PATTERN.test(qr[2]) ? { orderNumber: qr[1], token: qr[2] } : null
  }
  const token = s.replace(/[\s-]/g, '')
  return PICKUP_TOKEN_PATTERN.test(token) ? { token } : null
}
