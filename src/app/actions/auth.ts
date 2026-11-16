'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Role } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toActionError } from '@/lib/errors'
import { getClientInfo } from '@/lib/request'
import { authenticate } from '@/lib/auth/login'
import { changeSupabasePassword, completeUserLink, registerUser, requestUserPasswordReset } from '@/lib/auth/user-auth'
import { createSession, destroySession, getSessionUser, revokeAllSessions } from '@/lib/auth/session'
import { hashPassword, passwordSchema, verifyPassword } from '@/lib/auth/password'
import { PORTAL_HOME } from '@/lib/auth/guards'
import { enforceRateLimit } from '@/lib/auth/rate-limit'

export type FormState =
  | {
      error?: string
      fieldErrors?: Record<string, string[] | undefined>
      message?: string
      email?: string
    }
  | undefined

const PORTALS = ['USER', 'STAFF', 'CANTEEN'] as const

export async function loginAction(portal: Role, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!PORTALS.includes(portal)) return { error: 'Unknown portal.' }
  const email = String(formData.get('email') ?? '')
  const { ip } = await getClientInfo()
  let result
  try {
    result = await authenticate(portal, { email, password: String(formData.get('password') ?? '') }, ip)
  } catch (e) {
    return { error: toActionError(e).error, email }
  }
  await createSession(result.userId, result.role)
  redirect(result.mustChangePassword ? '/account/password' : PORTAL_HOME[result.role])
}

export async function logoutAction() {
  const user = await getSessionUser()
  if (user && user.role !== 'USER') {
    await audit({ actor: { userId: user.id, role: user.role }, action: 'auth.logout', entityType: 'User', entityId: user.id })
  }
  await destroySession()
  redirect('/')
}

export type LinkRequestState =
  | { error?: string; sent?: boolean; email?: string; values?: Record<string, string> }
  | undefined

/** User registration with any personal email (Supabase Auth). Also used to resend the activation email. */
export async function registerUserAction(_prev: LinkRequestState, formData: FormData): Promise<LinkRequestState> {
  const values = {
    email: String(formData.get('email') ?? '').trim(),
    fullName: String(formData.get('fullName') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim(),
    department: String(formData.get('department') ?? '').trim(),
  }
  const { ip } = await getClientInfo()
  try {
    await registerUser(values, ip)
  } catch (e) {
    return { error: toActionError(e).error, email: values.email, values }
  }
  // Same response whether or not the email already has an account (no enumeration)
  return { sent: true, email: values.email.toLowerCase(), values }
}

export async function requestPasswordResetLinkAction(_prev: LinkRequestState, formData: FormData): Promise<LinkRequestState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const { ip } = await getClientInfo()
  try {
    await requestUserPasswordReset(email, ip)
  } catch (e) {
    return { email, error: toActionError(e).error }
  }
  return { sent: true, email }
}

export async function setPasswordWithLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ip } = await getClientInfo()
  let result
  try {
    result = await completeUserLink(
      {
        tokenHash: String(formData.get('token') ?? '') || undefined,
        accessToken: String(formData.get('accessToken') ?? '') || undefined,
        refreshToken: String(formData.get('refreshToken') ?? '') || undefined,
        type: String(formData.get('type') ?? ''),
        password: String(formData.get('password') ?? ''),
        confirmPassword: String(formData.get('confirmPassword') ?? ''),
      },
      ip,
    )
  } catch (e) {
    return { error: toActionError(e).error }
  }
  await createSession(result.userId, 'USER')
  redirect(result.purpose === 'ACTIVATION' ? '/user/dashboard?activated=1' : '/user/dashboard?passwordReset=1')
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((v) => v.newPassword !== v.currentPassword, { message: 'Choose a different password', path: ['newPassword'] })

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

  try {
    await enforceRateLimit(`change-password:${user.id}`, 5, 15 * 60)
  } catch (e) {
    return toActionError(e)
  }
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } })
  if (row.supabaseUserId) {
    // Registered users keep their password in Supabase Auth
    try {
      const r = await changeSupabasePassword(row.email, parsed.data.currentPassword, parsed.data.newPassword)
      if (r === 'wrong_current') return { fieldErrors: { currentPassword: ['Current password is incorrect'] } }
    } catch (e) {
      return toActionError(e)
    }
  } else {
    if (!(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
      return { fieldErrors: { currentPassword: ['Current password is incorrect'] } }
    }
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false },
    })
  }
  await revokeAllSessions(user.id, user.sessionId)
  await audit({ actor: { userId: user.id, role: user.role }, action: 'auth.password_changed', entityType: 'User', entityId: user.id })
  redirect(PORTAL_HOME[user.role])
}
