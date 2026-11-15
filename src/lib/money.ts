// Pure money helpers, safe for client and server.
// All arithmetic happens in integer paise (1 INR = 100 paise).

export type Paise = number

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatINR(paise: Paise): string {
  return inr.format(paise / 100)
}

/** Converts a DECIMAL(10,2) string/number (rupees) to integer paise without float drift. */
export function rupeesToPaise(value: string | number | { toString(): string }): Paise {
  const s = typeof value === 'number' ? value.toFixed(2) : value.toString()
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?/.exec(s.trim())
  if (!m) throw new Error(`Invalid money value: ${s}`)
  const sign = m[1] ? -1 : 1
  const whole = parseInt(m[2], 10)
  const frac = parseInt((m[3] ?? '0').padEnd(2, '0'), 10)
  return sign * (whole * 100 + frac)
}

/** Integer paise → "123.45" string suitable for a DECIMAL column. */
export function paiseToDecimalString(paise: Paise): string {
  if (!Number.isInteger(paise)) throw new Error('Paise must be an integer')
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
