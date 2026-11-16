import 'server-only'
import { z } from 'zod'
import type { Role } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import { enforceRateLimit } from './rate-limit'
import { verifyPassword } from './password'
import { authenticateUser } from './user-auth'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z.string().min(1, 'Enter your password').max(200),
})

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

  // Users sign in through Supabase Auth; staff and canteen use the administrator-managed password
  let user
  if (portal === 'USER') {
    const r = await authenticateUser(email, password, (hash) => verifyPassword(password, hash))
    user = r ? await db.user.findUnique({ where: { id: r.userId } }) : null
  } else {
    const candidate = await db.user.findUnique({ where: { email } })
    user = candidate && (await verifyPassword(password, candidate.passwordHash)) ? candidate : null
  }

  // Same message for unknown email, wrong password and wrong portal
  if (!user || user.role !== portal) {
    const known = await db.user.findUnique({ where: { email }, select: { id: true, role: true } })
    if (known && known.role !== 'USER') {
      await audit({ action: 'auth.login_failed', entityType: 'User', entityId: known.id, metadata: { portal } })
    }
    throw new AppError('UNAUTHORIZED', 'Incorrect email or password.')
  }
  if (user.status === 'DEACTIVATED') {
    throw new AppError('FORBIDDEN', 'This account has been deactivated. Please contact the canteen office.')
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError('FORBIDDEN', 'Please activate your account first.')
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  if (user.role !== 'USER') {
    await audit({ actor: { userId: user.id, role: user.role }, action: 'auth.login', entityType: 'User', entityId: user.id })
  }
  return { userId: user.id, role: user.role, mustChangePassword: user.mustChangePassword }
}
