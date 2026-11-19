'use server'

import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { AppError, toActionError } from '@/lib/errors'
import { getClientInfo } from '@/lib/request'
import { authenticateAny } from '@/lib/auth/login'
import { cookies } from 'next/headers'
import { completeUserLink } from '@/lib/auth/user-auth'
import {
  changePasswordInRecovery,
  endRecoverySession,
  RECOVERY_COOKIE,
  RECOVERY_SB_COOKIE,
  requestPasswordRecovery,
  startRecoverySession,
} from '@/lib/auth/recovery'
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

/** The one sign-in form: email + password for any existing account. */
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '')
  const remember = formData.get('remember') === 'on'
  const { ip } = await getClientInfo()
  let result
  try {
    result = await authenticateAny({ email, password: String(formData.get('password') ?? '') }, ip)
  } catch (e) {
    return { error: toActionError(e).error, email }
  }
  await createSession(result.userId, result.role, { remember })
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

/** Forgot password: same answer whether or not the email has an account (no enumeration). */
export async function requestPasswordResetLinkAction(_prev: LinkRequestState, formData: FormData): Promise<LinkRequestState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const { ip } = await getClientInfo()
  try {
    await requestPasswordRecovery(email, ip)
  } catch (e) {
    return { email, error: toActionError(e).error }
  }
  return { sent: true, email }
}

// ---- Password recovery session (cookies are HTTP-only and end with the 15-minute window)

async function setRecoveryCookies(token: string, sb: { accessToken: string; refreshToken: string }, expiresAt: Date) {
  const jar = await cookies()
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', expires: expiresAt }
  jar.set(RECOVERY_COOKIE, token, opts)
  jar.set(RECOVERY_SB_COOKIE, JSON.stringify({ a: sb.accessToken, r: sb.refreshToken }), opts)
}

async function readRecoveryCookies() {
  const jar = await cookies()
  const token = jar.get(RECOVERY_COOKIE)?.value ?? null
  let sb: { accessToken: string; refreshToken: string } | null = null
  try {
    const raw = JSON.parse(jar.get(RECOVERY_SB_COOKIE)?.value ?? 'null')
    if (raw && typeof raw.a === 'string' && typeof raw.r === 'string') sb = { accessToken: raw.a, refreshToken: raw.r }
  } catch {}
  return { token, sb }
}

async function clearRecoveryCookies() {
  const jar = await cookies()
  jar.delete(RECOVERY_COOKIE)
  jar.delete(RECOVERY_SB_COOKIE)
}

/** "Continue" on the emailed link: verify it once with Supabase, then open the recovery session. */
export async function startRecoveryAction(formData: FormData): Promise<void> {
  const { ip } = await getClientInfo()
  let r
  try {
    r = await startRecoverySession(
      {
        tokenHash: String(formData.get('token') ?? '') || undefined,
        accessToken: String(formData.get('accessToken') ?? '') || undefined,
        refreshToken: String(formData.get('refreshToken') ?? '') || undefined,
      },
      ip,
    )
  } catch {
    r = { ok: false as const, reason: 'expired' as const }
  }
  if (!r.ok) {
    await clearRecoveryCookies()
    redirect(r.reason === 'not_allowed' ? '/reset-password?state=not_allowed' : '/reset-password?state=expired')
  }
  await setRecoveryCookies(r.token, r.supabase, r.expiresAt)
  redirect('/reset-password')
}

export type RecoveryFormState = { error?: string; changed?: number; until?: string } | undefined

export async function changeRecoveryPasswordAction(prev: RecoveryFormState, formData: FormData): Promise<RecoveryFormState> {
  const { token, sb } = await readRecoveryCookies()
  try {
    const r = await changePasswordInRecovery(token, sb, {
      password: String(formData.get('password') ?? ''),
      confirmPassword: String(formData.get('confirmPassword') ?? ''),
    })
    await setRecoveryCookies(token!, r.supabase, r.expiresAt)
    return { changed: (prev?.changed ?? 0) + 1, until: r.expiresAt.toISOString() }
  } catch (e) {
    if (e instanceof AppError && e.code === 'CONFLICT') {
      await clearRecoveryCookies()
      redirect('/reset-password?state=expired')
    }
    return { error: toActionError(e).error, changed: prev?.changed, until: prev?.until }
  }
}

/** Done: end the recovery session and go to sign in. */
export async function endRecoveryAction(): Promise<void> {
  const { token, sb } = await readRecoveryCookies()
  await endRecoverySession(token, sb)
  await clearRecoveryCookies()
  redirect('/login?reset=1')
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
