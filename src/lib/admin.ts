import 'server-only'
import { isDeletedAccountEmail } from '@/lib/account-deletion'
import { z } from 'zod'
import type { Role } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import { revokeAllSessions } from '@/lib/auth/session'
import { generateTemporaryPassword, hashPassword } from '@/lib/auth/password'
import { CANTEEN_PERMISSIONS, STAFF_PERMISSIONS } from '@/lib/auth/permissions'
import { assertPermission, type Actor } from '@/lib/auth/guards'

function requireStaff(actor: Actor) {
  if (actor.role !== 'STAFF') throw new AppError('FORBIDDEN', 'Staff only.')
}

const accountPerm = (kind: 'CANTEEN' | 'STAFF'): 'CANTEEN_ACCOUNTS' | 'STAFF_ACCOUNTS' =>
  kind === 'CANTEEN' ? 'CANTEEN_ACCOUNTS' : 'STAFF_ACCOUNTS'

// ---------------------------------------------------------------------------
// Users — enable or revoke CampusBite access (orders and payments are always kept)
// ---------------------------------------------------------------------------

export async function setUserAccess(actor: Actor, userId: string, active: boolean) {
  requireStaff(actor)
  assertPermission(actor, 'USERS')
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || user.role !== 'USER') throw new AppError('NOT_FOUND', 'User not found.')
  if (user.status === 'PENDING_VERIFICATION') throw new AppError('CONFLICT', 'This user has not activated their account yet.')
  if (isDeletedAccountEmail(user.email)) throw new AppError('CONFLICT', 'This account was deleted by its owner and cannot be restored.')
  await db.user.update({ where: { id: userId }, data: { status: active ? 'ACTIVE' : 'DEACTIVATED' } })
  if (!active) await revokeAllSessions(userId)
  await audit({ actor, action: active ? 'user.access_restored' : 'user.access_revoked', entityType: 'User', entityId: userId, metadata: { email: user.email } })
}

// ---------------------------------------------------------------------------
// Canteen operator & staff accounts (created only by authorised staff).
// They sign in at the Staff / Kitchen Login with this email and a temporary
// password, which they must change at first sign-in. No Google sign-in.
// ---------------------------------------------------------------------------

export const createAccountSchema = z.object({
  kind: z.enum(['CANTEEN', 'STAFF']),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
  name: z.string().trim().min(2, 'Enter a name').max(80),
  label: z.string().trim().max(60).optional().transform((v) => v || null),
  permissions: z.array(z.string()).max(12),
})

function validatePermissions(kind: 'CANTEEN' | 'STAFF', permissions: string[]) {
  const catalogue = kind === 'CANTEEN' ? CANTEEN_PERMISSIONS : STAFF_PERMISSIONS
  const bad = permissions.filter((p) => !(p in catalogue))
  if (bad.length) throw new AppError('VALIDATION', `Unknown permission: ${bad.join(', ')}`)
  return [...new Set(permissions)]
}

export async function createAccount(actor: Actor, input: z.input<typeof createAccountSchema>) {
  requireStaff(actor)
  const parsed = createAccountSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid details')
  const d = parsed.data
  assertPermission(actor, accountPerm(d.kind))
  const permissions = validatePermissions(d.kind, d.permissions)
  if (await db.user.findUnique({ where: { email: d.email } })) {
    throw new AppError('CONFLICT', 'An account with this email already exists (one email = one role).')
  }
  const tempPassword = generateTemporaryPassword()
  const user = await db.user.create({
    data: {
      email: d.email,
      name: d.name,
      role: d.kind as Role,
      status: 'ACTIVE',
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      emailVerifiedAt: new Date(),
      ...(d.kind === 'CANTEEN'
        ? { canteenProfile: { create: { counterName: d.label, permissions } } }
        : { staffProfile: { create: { title: d.label, permissions } } }),
    },
  })
  await audit({ actor, action: 'account.created', entityType: 'User', entityId: user.id, metadata: { email: d.email, role: d.kind, permissions } })
  return { userId: user.id, tempPassword }
}

async function loadManaged(actor: Actor, userId: string) {
  requireStaff(actor)
  const user = await db.user.findUnique({ where: { id: userId }, include: { staffProfile: true, canteenProfile: true } })
  if (!user || (user.role !== 'CANTEEN' && user.role !== 'STAFF')) throw new AppError('NOT_FOUND', 'Account not found.')
  assertPermission(actor, accountPerm(user.role))
  if (user.id === actor.userId) throw new AppError('FORBIDDEN', 'You can’t change your own account here — ask another administrator.')
  return user
}

export async function updateAccountPermissions(actor: Actor, userId: string, permissions: string[]) {
  const user = await loadManaged(actor, userId)
  const kind = user.role as 'CANTEEN' | 'STAFF'
  const next = validatePermissions(kind, permissions)
  const before = (kind === 'CANTEEN' ? user.canteenProfile?.permissions : user.staffProfile?.permissions) ?? []
  if (kind === 'CANTEEN') await db.canteenProfile.update({ where: { userId }, data: { permissions: next } })
  else await db.staffProfile.update({ where: { userId }, data: { permissions: next } })
  // Make the change effective immediately
  await revokeAllSessions(userId)
  await audit({ actor, action: 'account.permissions_changed', entityType: 'User', entityId: userId, metadata: { email: user.email, before, after: next } })
}

export async function setAccountStatus(actor: Actor, userId: string, active: boolean) {
  const user = await loadManaged(actor, userId)
  await db.user.update({ where: { id: userId }, data: { status: active ? 'ACTIVE' : 'DEACTIVATED' } })
  if (!active) await revokeAllSessions(userId)
  await audit({ actor, action: active ? 'account.reactivated' : 'account.deactivated', entityType: 'User', entityId: userId, metadata: { email: user.email } })
}

/** Gives a staff / kitchen account a new temporary password (they must change it at next sign-in). */
export async function resetAccountPassword(actor: Actor, userId: string) {
  const user = await loadManaged(actor, userId)
  const tempPassword = generateTemporaryPassword()
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true } })
  await revokeAllSessions(userId)
  await audit({ actor, action: 'account.password_reset', entityType: 'User', entityId: userId, metadata: { email: user.email } })
  return { tempPassword }
}
