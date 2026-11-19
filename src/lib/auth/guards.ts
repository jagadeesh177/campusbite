import 'server-only'
import { redirect } from 'next/navigation'
import type { Role } from '@prisma/client'
import { AppError } from '@/lib/errors'
import { getSessionUser, type SessionUser } from './session'
import type { Permission } from './permissions'

/** The authenticated principal passed into every service function. */
export interface Actor {
  userId: string
  role: Role
  name: string
  permissions: string[]
}

export const PORTAL_HOME: Record<Role, string> = {
  USER: '/user/dashboard',
  STAFF: '/staff/dashboard',
  CANTEEN: '/canteen/dashboard',
}

export const PORTAL_LOGIN: Record<Role, string> = {
  USER: '/login',
  STAFF: '/login/staff',
  CANTEEN: '/login/canteen',
}

export function toActor(u: SessionUser): Actor {
  return { userId: u.id, role: u.role, name: u.name, permissions: u.permissions }
}

export function hasPermission(actor: Pick<Actor, 'permissions'>, permission: Permission) {
  return actor.permissions.includes(permission)
}

/**
 * For pages and layouts: redirects instead of throwing. The role always comes
 * from the database session — never from anything the browser sends.
 */
export async function requirePortalUser(role: Role, permission?: Permission): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect(PORTAL_LOGIN[role])
  if (user.role !== role) redirect(PORTAL_HOME[user.role])
  if (permission && !user.permissions.includes(permission)) redirect(`${PORTAL_HOME[role]}?denied=1`)
  return user
}

/** For server actions and route handlers: throws AppError (never redirects). */
export async function requireActor(
  roles: Role | Role[],
  permission?: Permission,
): Promise<Actor> {
  const user = await getSessionUser()
  if (!user) throw new AppError('UNAUTHORIZED', 'Please sign in again.')
  const allowed = Array.isArray(roles) ? roles : [roles]
  if (!allowed.includes(user.role)) throw new AppError('FORBIDDEN', 'You do not have access to this.')
  if (permission && !user.permissions.includes(permission)) {
    throw new AppError('FORBIDDEN', 'You do not have permission to do this.')
  }
  return toActor(user)
}

export function assertPermission(actor: Actor, permission: Permission) {
  if (!actor.permissions.includes(permission)) {
    throw new AppError('FORBIDDEN', 'You do not have permission to do this.')
  }
}
