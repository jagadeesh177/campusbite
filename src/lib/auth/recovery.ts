import 'server-only'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { env } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { enforceRateLimit, rateLimit } from './rate-limit'
import { passwordSchema } from './password'
import { hashToken } from './session'
import { createSupabaseAuthClient, supabaseConfig } from './supabase'
import { resendInvitation } from './user-auth'

// ===========================================================================
// Password recovery with a hard 15-minute window
//
//  1. requestPasswordRecovery  — registered, active USER only (silent otherwise).
//     Revokes earlier resets/recovery sessions, records a PasswordReset whose
//     window ends 15 minutes from now, and asks Supabase to email the link
//     (Supabase link: single use, Email OTP expiry 900 s; a new one replaces
//     the old one).
//  2. startRecoverySession     — the user presses "Continue" on the link page;
//     Supabase verifies the token (single use). We create a RecoverySession
//     bound to that account, ending when the reset window ends.
//  3. changePasswordInRecovery — any number of password changes while the
//     recovery session is valid. Each change signs the account out elsewhere.
//  Tokens are never logged. The raw recovery token lives only in an HTTP-only
//  cookie; the database keeps its SHA-256.
// ===========================================================================

export const RECOVERY_WINDOW_MINUTES = 15
export const RECOVERY_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-cb_recovery' : 'cb_recovery'
/** Supabase session for the recovery (needed to set the password) — HTTP-only cookie */
export const RECOVERY_SB_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-cb_recovery_sb' : 'cb_recovery_sb'

const emailSchema = z.string().trim().toLowerCase().max(254).email('Enter a valid email address')
const confirmUrl = () => `${env.appUrl.replace(/\/$/, '')}/auth/confirm`

function requireSupabase() {
  if (!supabaseConfig().configured) throw new AppError('UNAVAILABLE', 'Password reset is temporarily unavailable. Please try again later.')
}

/** Revokes every open reset window and recovery session for a user. */
async function revokeRecoveries(userId: string) {
  const now = new Date()
  await db.passwordReset.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })
  await db.recoverySession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })
}

/**
 * Step 1. Always resolves the same way for the caller (no account enumeration).
 * Throws only for invalid input, rate limits or a delivery failure for a real account.
 */
export async function requestPasswordRecovery(rawEmail: string, ip: string | null): Promise<void> {
  const parsed = emailSchema.safeParse(rawEmail)
  if (!parsed.success) throw new AppError('VALIDATION', 'Enter a valid email address.')
  const address = parsed.data
  requireSupabase()
  if (ip) await enforceRateLimit(`recovery-ip:${ip}`, 10, 60 * 60)
  await enforceRateLimit(`recovery-email:${address}`, 5, 60 * 60)

  const user = await db.user.findUnique({ where: { email: address } })
  // A staff-created account that never set a password gets its activation link again
  if (user && user.role === 'USER' && user.status === 'PENDING_VERIFICATION') return resendInvitation(address, ip)
  if (!user || user.role !== 'USER' || user.status !== 'ACTIVE' || !user.supabaseUserId) {
    await audit({ action: 'user.password_reset_requested', entityType: 'User', metadata: { outcome: 'no_eligible_account' } })
    return
  }
  // One email per account at a time: a second request inside the window is acknowledged silently
  const cooldown = await rateLimit(`recovery-send:${user.id}`, 1, 60)
  if (!cooldown.ok) return

  await revokeRecoveries(user.id)
  const issuedAt = new Date()
  const reset = await db.passwordReset.create({
    data: { userId: user.id, requestedAt: issuedAt, expiresAt: new Date(issuedAt.getTime() + RECOVERY_WINDOW_MINUTES * 60_000) },
  })
  const { error } = await createSupabaseAuthClient().auth.resetPasswordForEmail(address, { redirectTo: confirmUrl() })
  if (error) {
    await db.passwordReset.update({ where: { id: reset.id }, data: { revokedAt: new Date() } })
    await db.rateLimitBucket.deleteMany({ where: { key: `recovery-send:${user.id}` } })
    console.error('[recovery] reset email not sent', error.code, error.status)
    if (error.status === 429) throw new AppError('RATE_LIMITED', 'Too many emails were requested. Please wait a few minutes and try again.')
    throw new AppError('UNAVAILABLE', 'We couldn’t send the email right now. Please try again in a few minutes.')
  }
  await audit({ actor: { userId: user.id, role: 'USER' }, action: 'user.password_reset_requested', entityType: 'User', entityId: user.id, metadata: { outcome: 'link_sent' } })
}

export type RecoveryStart =
  | { ok: true; token: string; expiresAt: Date; supabase: { accessToken: string; refreshToken: string } }
  | { ok: false; reason: 'expired' | 'not_allowed' }

/**
 * Step 2. Verifies the emailed link with Supabase (single use) and opens a
 * recovery session for that one account. Either a token_hash (CampusBite email
 * template) or the session Supabase's default link put in the URL fragment.
 */
export async function startRecoverySession(
  input: { tokenHash?: string; accessToken?: string; refreshToken?: string },
  ip: string | null,
): Promise<RecoveryStart> {
  requireSupabase()
  if (ip) await enforceRateLimit(`recovery-start:${ip}`, 20, 60 * 60)
  const client = createSupabaseAuthClient()
  const result = input.tokenHash
    ? /^[A-Za-z0-9_-]{8,200}$/.test(input.tokenHash)
      ? await client.auth.verifyOtp({ token_hash: input.tokenHash, type: 'recovery' })
      : null
    : input.accessToken && input.refreshToken
      ? await client.auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken })
      : null
  const sbUser = result?.data.user
  const sbSession = result?.data.session
  if (!result || result.error || !sbUser?.email || !sbSession?.access_token || !sbSession.refresh_token) {
    await audit({ action: 'user.recovery_rejected', entityType: 'User', metadata: { reason: result?.error?.code ?? 'invalid_link' } })
    return { ok: false, reason: 'expired' }
  }

  const user = await db.user.findFirst({ where: { OR: [{ supabaseUserId: sbUser.id }, { email: sbUser.email.toLowerCase() }] } })
  if (!user || user.role !== 'USER' || user.status !== 'ACTIVE') {
    await client.auth.signOut().catch(() => undefined)
    return { ok: false, reason: 'not_allowed' }
  }
  const reset = await db.passwordReset.findFirst({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { requestedAt: 'desc' },
  })
  if (!reset) {
    await client.auth.signOut().catch(() => undefined)
    return { ok: false, reason: 'expired' }
  }

  const token = randomBytes(32).toString('base64url')
  // Only one recovery session per reset: opening the link again replaces the earlier one
  await db.recoverySession.updateMany({ where: { passwordResetId: reset.id, revokedAt: null }, data: { revokedAt: new Date() } })
  await db.recoverySession.create({
    data: { tokenHash: hashToken(token), userId: user.id, passwordResetId: reset.id, expiresAt: reset.expiresAt },
  })
  await db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: reset.usedAt ?? new Date() } })
  if (!user.supabaseUserId) await db.user.update({ where: { id: user.id }, data: { supabaseUserId: sbUser.id } })
  await audit({ actor: { userId: user.id, role: 'USER' }, action: 'user.recovery_started', entityType: 'User', entityId: user.id })
  return {
    ok: true,
    token,
    expiresAt: reset.expiresAt,
    supabase: { accessToken: sbSession.access_token, refreshToken: sbSession.refresh_token },
  }
}

export type RecoveryState =
  | { valid: true; userId: string; email: string; expiresAt: Date; passwordChanges: number }
  | { valid: false; email?: string }

/** Is this recovery cookie still good? (not revoked, reset not revoked, before the hard expiry) */
export async function getRecoverySession(token: string | undefined | null): Promise<RecoveryState> {
  if (!token) return { valid: false }
  const s = await db.recoverySession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { passwordReset: true, user: { select: { email: true, status: true, role: true } } },
  })
  if (!s) return { valid: false }
  const now = new Date()
  const valid =
    !s.revokedAt && !s.passwordReset.revokedAt && s.expiresAt > now && s.passwordReset.expiresAt > now &&
    s.user.role === 'USER' && s.user.status === 'ACTIVE'
  return valid
    ? { valid: true, userId: s.userId, email: s.user.email, expiresAt: s.expiresAt, passwordChanges: s.passwordChanges }
    : { valid: false, email: s.user.email }
}

const changeSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })

/**
 * Step 3. Sets a new password using the recovery session. Can be repeated
 * until the window ends. Returns Supabase's refreshed session tokens.
 */
export async function changePasswordInRecovery(
  token: string | undefined | null,
  supabaseTokens: { accessToken: string; refreshToken: string } | null,
  input: { password: string; confirmPassword: string },
): Promise<{ supabase: { accessToken: string; refreshToken: string }; expiresAt: Date }> {
  const state = await getRecoverySession(token)
  if (!state.valid) throw new AppError('CONFLICT', 'This password reset link has expired.')
  const parsed = changeSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  if (!supabaseTokens) throw new AppError('CONFLICT', 'This password reset link has expired.')
  await enforceRateLimit(`recovery-change:${state.userId}`, 10, RECOVERY_WINDOW_MINUTES * 60)

  const user = await db.user.findUniqueOrThrow({ where: { id: state.userId } })
  const client = createSupabaseAuthClient()
  const { data, error } = await client.auth.setSession({ access_token: supabaseTokens.accessToken, refresh_token: supabaseTokens.refreshToken })
  // The Supabase session must belong to the same account the recovery session was opened for
  if (error || !data.user || !data.session || (user.supabaseUserId && data.user.id !== user.supabaseUserId)) {
    throw new AppError('CONFLICT', 'This password reset link has expired.')
  }
  const { error: pwError } = await client.auth.updateUser({ password: parsed.data.password })
  if (pwError) {
    console.error('[recovery] password update failed', pwError.code)
    throw new AppError(
      'VALIDATION',
      pwError.code === 'same_password' ? 'Choose a password different from your current one.' : 'We couldn’t save your password. Please try a different one.',
    )
  }
  await db.$transaction(async (tx) => {
    await tx.recoverySession.update({ where: { tokenHash: hashToken(token!) }, data: { passwordChanges: { increment: 1 } } })
    // A new password signs the account out on every device
    await tx.session.deleteMany({ where: { userId: user.id } })
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: null, mustChangePassword: false } })
    await audit({ actor: { userId: user.id, role: 'USER' }, action: 'user.password_reset', entityType: 'User', entityId: user.id, metadata: { via: 'recovery_session' } }, tx)
  })
  return {
    supabase: { accessToken: data.session.access_token, refreshToken: data.session.refresh_token },
    expiresAt: state.expiresAt,
  }
}

/** Ends a recovery session early (the user is done). */
export async function endRecoverySession(token: string | undefined | null, supabaseTokens: { accessToken: string; refreshToken: string } | null) {
  if (token) await db.recoverySession.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } })
  if (supabaseTokens && supabaseConfig().configured) {
    const client = createSupabaseAuthClient()
    const r = await client.auth.setSession({ access_token: supabaseTokens.accessToken, refresh_token: supabaseTokens.refreshToken }).catch(() => null)
    if (r && !r.error) await client.auth.signOut().catch(() => undefined)
  }
}
