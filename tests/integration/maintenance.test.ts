import { beforeEach, describe, expect, it } from 'vitest'
import { purgeExpiredTechnicalRows } from '@/lib/maintenance'
import { createUser, prisma, resetDb } from '../helpers'

beforeEach(async () => {
  await resetDb()
})

describe('daily cleanup', () => {
  it('removes only long-expired sessions, old live events and stale rate-limit counters', async () => {
    const { user } = await createUser()
    const day = 24 * 60 * 60 * 1000
    const now = new Date()
    await prisma.session.createMany({
      data: [
        { tokenHash: 'a'.repeat(64), userId: user.id, expiresAt: new Date(now.getTime() - 2 * day) }, // gone
        { tokenHash: 'b'.repeat(64), userId: user.id, expiresAt: new Date(now.getTime() - 60_000) }, // just expired: kept a day
        { tokenHash: 'c'.repeat(64), userId: user.id, expiresAt: new Date(now.getTime() + day) }, // live
      ],
    })
    await prisma.realtimeEvent.createMany({
      data: [
        { type: 'ORDER_UPDATED', forUserId: user.id, payload: {}, createdAt: new Date(now.getTime() - 4 * day) },
        { type: 'ORDER_UPDATED', forUserId: user.id, payload: {} },
      ],
    })
    await prisma.rateLimitBucket.createMany({
      data: [
        { key: 'old', count: 3, windowStart: new Date(now.getTime() - 3 * day) },
        { key: 'new', count: 3, windowStart: now },
      ],
    })

    expect(await purgeExpiredTechnicalRows(now)).toEqual({ sessions: 1, events: 1, rateLimits: 1 })
    expect(await prisma.session.count()).toBe(2)
    expect(await prisma.realtimeEvent.count()).toBe(1)
    expect((await prisma.rateLimitBucket.findMany()).map((b) => b.key)).toEqual(['new'])
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1)
  })
})
