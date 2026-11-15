import 'server-only'
import type { PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'

/**
 * Fixed-window rate limiter stored in Postgres, so limits hold across
 * serverless instances. The upsert is a single atomic statement.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  client: Pick<PrismaClient, '$queryRaw'> = db,
): Promise<{ ok: boolean; remaining: number; retryAfterSeconds: number }> {
  const rows = await client.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."windowStart" < now() - make_interval(secs => ${windowSeconds})
        THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE
        WHEN "RateLimitBucket"."windowStart" < now() - make_interval(secs => ${windowSeconds})
        THEN now() ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count", "windowStart"`
  const { count, windowStart } = rows[0]
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000),
  )
  return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds }
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const r = await rateLimit(key, limit, windowSeconds)
  if (!r.ok) {
    const mins = Math.max(1, Math.ceil(r.retryAfterSeconds / 60))
    throw new AppError('RATE_LIMITED', `Too many attempts. Please try again in ${mins} minute${mins > 1 ? 's' : ''}.`)
  }
}
