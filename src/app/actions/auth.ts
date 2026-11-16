'use server'

import { redirect } from 'next/navigation'
import type { Role } from '@prisma/client'
import { audit } from '@/lib/audit'
import { toActionError } from '@/lib/errors'
import { getClientInfo } from '@/lib/request'
import { authenticate } from '@/lib/auth/login'
import { completeUserLink, registerUser, requestUserPasswordReset } from '@/lib/auth/user-auth'
import { changeOwnPassword } from '@/lib/auth/change-password'
import { createSession, destroySession, getSessionUser } from '@/lib/auth/session'
import { PORTAL_HOME } from '@/lib/auth/guards'

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

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  let r
  try {
    r = await changeOwnPassword(
      { userId: user.id, sessionId: user.sessionId },
      {
        currentPassword: String(formData.get('currentPassword') ?? ''),
        newPassword: String(formData.get('newPassword') ?? ''),
        confirmPassword: String(formData.get('confirmPassword') ?? ''),
      },
    )
  } catch (e) {
    return toActionError(e)
  }
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors }
  redirect(PORTAL_HOME[user.role])
}
