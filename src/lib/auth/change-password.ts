import 'server-only'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { enforceRateLimit } from './rate-limit'
import { hashPassword, passwordSchema, verifyPassword } from './password'
import { changeSupabasePassword } from './user-auth'
import { revokeAllSessions } from './session'

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
 * A signed-in person changes their OWN password (the user id always comes from
 * the session, never from the form). Registered users' passwords live only in
 * Supabase Auth — checked with the current password, then set with updateUser().
 * Older accounts without a Supabase login keep their bcrypt hash. Passwords are
 * never logged. Other sessions are signed out afterwards.
 */
export async function changeOwnPassword(
  session: { userId: string; sessionId?: string },
  input: { currentPassword: string; newPassword: string; confirmPassword: string },
): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors }
  await enforceRateLimit(`change-password:${session.userId}`, 5, 15 * 60)

  const row = await db.user.findUnique({ where: { id: session.userId } })
  if (!row || row.status !== 'ACTIVE') return { ok: false, error: 'Your session has expired. Please sign in again.' }

  const wrong = { ok: false as const, fieldErrors: { currentPassword: ['Current password is incorrect'] } }
  if (row.supabaseUserId) {
    const r = await changeSupabasePassword(row.email, parsed.data.currentPassword, parsed.data.newPassword)
    if (r === 'wrong_current') return wrong
  } else {
    if (!(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) return wrong
    await db.user.update({
      where: { id: row.id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false },
    })
  }
  await revokeAllSessions(row.id, session.sessionId)
  await audit({ actor: { userId: row.id, role: row.role }, action: 'auth.password_changed', entityType: 'User', entityId: row.id })
  return { ok: true }
}
