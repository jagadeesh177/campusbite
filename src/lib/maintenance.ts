import 'server-only'
import { db } from '@/lib/db'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Daily cleanup of short-lived technical rows that otherwise grow forever:
 *  • sessions that expired more than a day ago (they can never be used again)
 *  • live-update events older than 3 days (browsers only replay the last few seconds)
 *  • rate-limit counters whose window ended more than 2 days ago
 * Never touches orders, payments, refunds, audit logs, users or webhook records.
 */
export async function purgeExpiredTechnicalRows(now = new Date()) {
  const [sessions, events, rateLimits] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - DAY_MS) } } }),
    db.realtimeEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 3 * DAY_MS) } } }),
    db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 2 * DAY_MS) } } }),
  ])
  return { sessions: sessions.count, events: events.count, rateLimits: rateLimits.count }
}
