import 'server-only'
import { z } from 'zod'
import type { Role } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import { getCollegeProvider } from '@/lib/college'
import { enforceRateLimit } from './rate-limit'
import { verifyPassword } from './password'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z.string().min(1, 'Enter your password').max(200),
})

const ENROLLMENT_RECHECK_MS = 24 * 60 * 60 * 1000

/**
 * Verifies credentials for ONE portal. The portal only narrows who may sign
 * in there — the role itself always comes from the database.
 */
export async function authenticate(
  portal: Role,
  input: { email: string; password: string },
  ip: string | null,
): Promise<{ userId: string; role: Role; mustChangePassword: boolean }> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', 'Enter your email and password.')
  const { email, password } = parsed.data

  await enforceRateLimit(`login:${email}`, 5, 15 * 60)
  if (ip) await enforceRateLimit(`login-ip:${ip}`, 40, 15 * 60)

  const user = await db.user.findUnique({ where: { email }, include: { studentProfile: true } })
  const valid = await verifyPassword(password, user?.passwordHash)

  // Same message for unknown email, wrong password and wrong portal
  if (!user || !valid || user.role !== portal) {
    if (user && user.role !== 'STUDENT') {
      await audit({ action: 'auth.login_failed', entityType: 'User', entityId: user.id, metadata: { portal } })
    }
    throw new AppError('UNAUTHORIZED', 'Incorrect email or password.')
  }
  if (user.status === 'DEACTIVATED') {
    throw new AppError('FORBIDDEN', 'This account has been deactivated. Please contact the canteen office.')
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError('FORBIDDEN', 'Please activate your account first.')
  }

  // Students: periodically re-confirm enrollment with the college system
  if (user.role === 'STUDENT') {
    const profile = user.studentProfile
    if (!profile) throw new AppError('FORBIDDEN', 'Your student profile is incomplete. Please re-activate.')
    const stale = !profile.enrollmentCheckedAt || Date.now() - profile.enrollmentCheckedAt.getTime() > ENROLLMENT_RECHECK_MS
    if (stale) {
      const status = await getCollegeProvider().checkEnrollmentStatus(profile.externalStudentId)
      if (status !== 'UNKNOWN') {
        await db.studentProfile.update({
          where: { id: profile.id },
          data: { enrollmentStatus: status, enrollmentCheckedAt: new Date() },
        })
      }
      // UNKNOWN = college system unreachable: fall back to the last known status
      const effective = status === 'UNKNOWN' ? profile.enrollmentStatus : status
      if (effective !== 'ENROLLED') {
        throw new AppError('FORBIDDEN', 'College records show you are not currently enrolled, so CampusBite access is paused.')
      }
    } else if (profile.enrollmentStatus !== 'ENROLLED') {
      throw new AppError('FORBIDDEN', 'College records show you are not currently enrolled, so CampusBite access is paused.')
    }
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  if (user.role !== 'STUDENT') {
    await audit({ actor: { userId: user.id, role: user.role }, action: 'auth.login', entityType: 'User', entityId: user.id })
  }
  return { userId: user.id, role: user.role, mustChangePassword: user.mustChangePassword }
}
