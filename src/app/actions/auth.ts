'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Role } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { toActionError } from '@/lib/errors'
import { getClientInfo } from '@/lib/request'
import { authenticate } from '@/lib/auth/login'
import { completeStudentActivation, startStudentActivation } from '@/lib/auth/activation'
import { createSession, destroySession, getSessionUser, revokeAllSessions } from '@/lib/auth/session'
import { hashPassword, passwordSchema, verifyPassword } from '@/lib/auth/password'
import { PORTAL_HOME } from '@/lib/auth/guards'
import { enforceRateLimit } from '@/lib/auth/rate-limit'

export type FormState =
  | {
      error?: string
      fieldErrors?: Record<string, string[] | undefined>
      message?: string
      step?: 'email' | 'code'
      email?: string
    }
  | undefined

const PORTALS = ['STUDENT', 'STAFF', 'CANTEEN'] as const

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
  if (user && user.role !== 'STUDENT') {
    await audit({ actor: { userId: user.id, role: user.role }, action: 'auth.logout', entityType: 'User', entityId: user.id })
  }
  await destroySession()
  redirect('/')
}

export async function startActivationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const { ip } = await getClientInfo()
  try {
    await startStudentActivation(email, ip)
  } catch (e) {
    return { step: 'email', email, error: toActionError(e).error }
  }
  return {
    step: 'code',
    email,
    message: `If ${email} belongs to a currently-enrolled student, we've sent a 6-digit code. It expires in 10 minutes.`,
  }
}

export async function completeActivationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '')
  let userId: string
  try {
    ;({ userId } = await completeStudentActivation({
      email,
      code: String(formData.get('code') ?? ''),
      password: String(formData.get('password') ?? ''),
      confirmPassword: String(formData.get('confirmPassword') ?? ''),
    }))
  } catch (e) {
    return { step: 'code', email, error: toActionError(e).error }
  }
  await createSession(userId, 'STUDENT')
  redirect('/student/dashboard?welcome=1')
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
  if (!(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
    return { fieldErrors: { currentPassword: ['Current password is incorrect'] } }
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false },
  })
  await revokeAllSessions(user.id, user.sessionId)
  await audit({ actor: { userId: user.id, role: user.role }, action: 'auth.password_changed', entityType: 'User', entityId: user.id })
  redirect(PORTAL_HOME[user.role])
}
