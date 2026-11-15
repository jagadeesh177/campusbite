import { Prisma } from '@prisma/client'

function isRetryable(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (e.code === 'P2034') return true // serialization failure / deadlock
  if (e.code === 'P2002') {
    // Collision on a randomly generated code — safe to retry with a new one
    const target = JSON.stringify(e.meta?.target ?? '')
    return target.includes('orderNumber') || target.includes('token')
  }
  return false
}

/** Retries a whole transaction on serialization conflicts and random-code collisions. */
export async function withTxRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i >= attempts - 1 || !isRetryable(e)) throw e
      await new Promise((r) => setTimeout(r, 15 * 2 ** i + Math.random() * 25))
    }
  }
}

export function isUniqueViolation(e: unknown, field?: string): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === 'P2002' &&
    (!field || JSON.stringify(e.meta?.target ?? '').includes(field))
  )
}
