import 'server-only'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import { enforceRateLimit } from './rate-limit'
import { hashPassword, passwordSchema, verifyPassword } from './password'
import { revokeAllSessions } from './session'

// ===========================================================================
// Email + password sign-in for STAFF and CANTEEN (kitchen) accounts only.
// These accounts are created by an administrator (Staff → Accounts) with a
// temporary password that must be changed at first sign-in. Customers (USER)
// sign in with Google only and never through here.
// ===========================================================================

export type PasswordPortal = 'STAFF' | 'CANTEEN'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z.string().min(1, 'Enter your password').max(200),
})

/**
 * Verifies credentials for ONE portal (staff or kitchen). The role always comes
 * from the database; the portal only narrows who may sign in there.
 */
export async function authenticate(
  portal: PasswordPortal,
  input: { email: string; password: string },
  ip: string | null,
): Promise<{ userId: string; role: PasswordPortal; mustChangePassword: boolean }> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', 'Enter your email and password.')
  const { email, password } = parsed.data

  // Tight per (email, network) so guessing is slow; a looser per-email cap stops
  // distributed guessing without letting one stranger lock the real owner out.
  await enforceRateLimit(`login:${email}:${ip ?? '-'}`, 5, 15 * 60)
  await enforceRateLimit(`login:${email}`, 30, 60 * 60)
  if (ip) await enforceRateLimit(`login-ip:${ip}`, 40, 15 * 60)

  const candidate = await db.user.findUnique({ where: { email } })
  const passwordOk = await verifyPassword(password, candidate?.passwordHash)

  // Same message for unknown email, wrong password and wrong portal
  if (!candidate || !passwordOk || candidate.role !== portal) {
    if (candidate && candidate.role !== 'USER') {
      await audit({ action: 'auth.login_failed', entityType: 'User', entityId: candidate.id, metadata: { portal } })
    }
    throw new AppError('UNAUTHORIZED', 'Incorrect email or password.')
  }
  if (candidate.status !== 'ACTIVE') {
    throw new AppError('FORBIDDEN', 'This account has been deactivated. Please contact the administrator.')
  }

  await db.user.update({ where: { id: candidate.id }, data: { lastLoginAt: new Date() } })
  await audit({ actor: { userId: candidate.id, role: candidate.role }, action: 'auth.login', entityType: 'User', entityId: candidate.id, metadata: { via: 'password', portal } })
  return { userId: candidate.id, role: portal, mustChangePassword: candidate.mustChangePassword }
}

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((v) => v.newPassword !== v.currentPassword, { message: 'Choose a different password', path: ['newPassword'] })

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors?: Record<string, string[] | undefined> }

/**
 * A signed-in staff or kitchen account changes its OWN password (the id comes
 * from the session, never the form). Other sessions are signed out afterwards.
 */
export async function changeOwnPassword(
  session: { userId: string; sessionId?: string },
  input: { currentPassword: string; newPassword: string; confirmPassword: string },
): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors }
  await enforceRateLimit(`change-password:${session.userId}`, 5, 15 * 60)

  const row = await db.user.findUnique({ where: { id: session.userId } })
  if (!row || row.status !== 'ACTIVE' || row.role === 'USER') {
    return { ok: false, error: 'Your session has expired. Please sign in again.' }
  }
  if (!(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
    return { ok: false, fieldErrors: { currentPassword: ['Current password is incorrect'] } }
  }
  await db.user.update({
    where: { id: row.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false },
  })
  await revokeAllSessions(row.id, session.sessionId)
  await audit({ actor: { userId: row.id, role: row.role }, action: 'auth.password_changed', entityType: 'User', entityId: row.id })
  return { ok: true }
}
