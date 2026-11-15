import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { cache } from 'react'
import type { Role } from '@prisma/client'
import { db } from '@/lib/db'
import { getClientInfo } from '@/lib/request'

// __Host- prefix forces Secure + Path=/ + no Domain in production.
export const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-cb_session' : 'cb_session'

const TTL_MS: Record<Role, number> = {
  STUDENT: 7 * 24 * 60 * 60 * 1000,
  STAFF: 12 * 60 * 60 * 1000,
  CANTEEN: 16 * 60 * 60 * 1000,
}

export interface SessionUser {
  id: string
  sessionId: string
  email: string
  name: string
  role: Role
  permissions: string[]
  mustChangePassword: boolean
  student: {
    externalStudentId: string
    enrollmentStatus: string
  } | null
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string, role: Role): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + TTL_MS[role])
  const { ip, userAgent } = await getClientInfo()
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, ip, userAgent },
  })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

/** Resolves the signed-in user once per request. Returns null if not signed in or not active. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { include: { studentProfile: true, staffProfile: true, canteenProfile: true } },
    },
  })
  if (!session || session.expiresAt < new Date()) return null
  const u = session.user
  if (u.status !== 'ACTIVE') return null

  // Touch at most every 5 minutes to avoid a write per request.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
  }

  const permissions =
    u.role === 'STAFF'
      ? (u.staffProfile?.permissions ?? [])
      : u.role === 'CANTEEN'
        ? (u.canteenProfile?.permissions ?? [])
        : []

  return {
    id: u.id,
    sessionId: session.id,
    email: u.email,
    name: u.name,
    role: u.role,
    permissions,
    mustChangePassword: u.mustChangePassword,
    student: u.studentProfile
      ? {
          externalStudentId: u.studentProfile.externalStudentId,
          enrollmentStatus: u.studentProfile.enrollmentStatus,
        }
      : null,
  }
})

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  jar.delete(SESSION_COOKIE)
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await db.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  })
}
