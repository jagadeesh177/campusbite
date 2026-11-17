import { Prisma } from '@prisma/client'

/**
 * Text describing which columns a unique-constraint error is about. The Rust engine
 * reports them in meta.target; the `pg` driver adapter reports them inside
 * meta.driverAdapterError and the message — so look at all of them.
 */
function constraintText(e: Prisma.PrismaClientKnownRequestError): string {
  return JSON.stringify(e.meta ?? '') + ' ' + e.message
}

/** Postgres serialization failure / deadlock, as reported by either engine. */
function isSerializationFailure(e: Prisma.PrismaClientKnownRequestError): boolean {
  if (e.code === 'P2034') return true
  const t = constraintText(e)
  return /40001|40P01|TransactionWriteConflict|could not serialize|deadlock detected/i.test(t)
}

/** Errors raised directly by the `pg` driver adapter (not wrapped by Prisma). */
function adapterErrorText(e: unknown): string | null {
  if (!e || typeof e !== 'object') return null
  const err = e as { name?: string; message?: string; cause?: unknown }
  if (err.name !== 'DriverAdapterError' && err.constructor?.name !== 'DriverAdapterError') return null
  return String(err.message) + ' ' + JSON.stringify(err.cause ?? '')
}

function isRetryable(e: unknown): boolean {
  const adapter = adapterErrorText(e)
  if (adapter !== null) {
    if (/TransactionWriteConflict|40001|40P01|could not serialize|deadlock/i.test(adapter)) return true
    return /UniqueConstraintViolation/.test(adapter) && /orderNumber|token/.test(adapter)
  }
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (isSerializationFailure(e)) return true
  if (e.code === 'P2002') {
    // Collision on a randomly generated code — safe to retry with a new one
    const target = constraintText(e)
    return target.includes('orderNumber') || target.includes('token')
  }
  return false
}

/** Retries a whole transaction on serialization conflicts and random-code collisions. */
export async function withTxRetry<T>(fn: () => Promise<T>, attempts = 10): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i >= attempts - 1 || !isRetryable(e)) throw e
      // Exponential backoff with full jitter so simultaneous checkouts spread out
      const cap = Math.min(800, 20 * 2 ** i)
      await new Promise((r) => setTimeout(r, cap / 2 + Math.random() * cap))
    }
  }
}

export function isUniqueViolation(e: unknown, field?: string): boolean {
  const adapter = adapterErrorText(e)
  if (adapter !== null) return /UniqueConstraintViolation/.test(adapter) && (!field || adapter.includes(field))
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === 'P2002' &&
    (!field || constraintText(e).includes(field))
  )
}
