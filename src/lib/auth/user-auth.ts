import 'server-only'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { env } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { enforceRateLimit, rateLimit } from './rate-limit'
import { passwordSchema } from './password'
import { createSupabaseAuthClient, supabaseConfig } from './supabase'

/**
 * User accounts (Supabase Auth). There is NO public sign-up:
 *
 *  1. inviteUser        → STAFF (USERS permission) creates a pending account; Supabase
 *                          emails an activation link
 *  2. completeUserLink  → the invited user opens the link (single use, expires) and sets a
 *                          password; only an existing pending account can be activated
 *  3. authenticateUser  → Supabase checks the password, CampusBite issues its own session
 *  Users may also sign in with Google (src/lib/auth/google.ts) — sign-in only.
 *  Password recovery: src/lib/auth/recovery.ts.
 */

/** One email per address per 15 minutes; the link itself also expires (Supabase "Email OTP expiry"). */
export const EMAIL_COOLDOWN_MINUTES = 15

const email = z.string().trim().toLowerCase().max(254).email('Enter a valid email address')

export const invitationSchema = z.object({
  email,
  fullName: z.string().trim().min(2, 'Enter the full name').max(80, 'Name is too long'),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
    .pipe(z.string().regex(/^([6-9]\d{9})?$/, 'Enter a valid 10-digit mobile number'))
    .optional()
    .transform((v) => (v ? `+91${v}` : undefined)),
  department: z.string().trim().max(80).optional().transform((v) => v || undefined),
})

export const emailOnlySchema = z.object({ email })

// Activation links only — recovery links go through src/lib/auth/recovery.ts
const LINK_TYPES = ['email', 'signup', 'magiclink', 'invite'] as const
export type LinkType = (typeof LINK_TYPES)[number]

export const completeLinkSchema = z
  .object({
    // CampusBite email templates: ?token_hash=…&type=…  (verified here, single use)
    tokenHash: z.string().regex(/^[A-Za-z0-9_-]{8,200}$/, 'This link is invalid.').optional(),
    // Supabase default templates: Supabase already verified the link and handed over a session
    accessToken: z.string().min(20).max(4096).optional(),
    refreshToken: z.string().min(4).max(512).optional(),
    type: z.enum(LINK_TYPES, { message: 'This link is invalid.' }),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((v) => Boolean(v.tokenHash) || Boolean(v.accessToken && v.refreshToken), { message: 'This link is invalid.', path: ['tokenHash'] })

function requireSupabase() {
  if (!supabaseConfig().configured) {
    throw new AppError('UNAVAILABLE', 'Account emails are temporarily unavailable. Please try again later.')
  }
}

const confirmUrl = () => `${env.appUrl}/auth/confirm`

async function cooldown(kind: string, address: string, ip: string | null): Promise<string> {
  if (ip) await enforceRateLimit(`user-email-ip:${ip}`, 10, 60 * 60)
  const key = `user-email:${kind}:${address}`
  const r = await rateLimit(key, 1, EMAIL_COOLDOWN_MINUTES * 60)
  if (!r.ok) {
    const mins = Math.max(1, Math.ceil(r.retryAfterSeconds / 60))
    throw new AppError(
      'RATE_LIMITED',
      `We already sent an email to this address. Please use the link in that email, or request a new one in ${mins} minute${mins > 1 ? 's' : ''}.`,
    )
  }
  return key
}

/** If the email could not be sent, don't make the user wait out the cooldown. */
const releaseCooldown = (key: string) => db.rateLimitBucket.deleteMany({ where: { key } })

function sendFailure(e: { code?: string; status?: number; message?: string }): never {
  if (e.code === 'over_email_send_rate_limit' || e.status === 429) {
    throw new AppError('RATE_LIMITED', 'Too many emails were requested. Please wait a few minutes and try again.')
  }
  if (e.code === 'email_address_invalid') throw new AppError('VALIDATION', 'Enter a valid email address.')
  console.error('[user-auth] Supabase could not send the email', e.code, e.status, e.message)
  throw new AppError('UNAVAILABLE', 'We couldn’t send the email right now. Please try again in a few minutes.')
}

async function logRequest(action: string, address: string, outcome: string) {
  await audit({ action, entityType: 'User', metadata: { outcome, email: address } })
}

async function sendActivation(address: string, name: string) {
  const { error } = await createSupabaseAuthClient().auth.signInWithOtp({
    email: address,
    options: { shouldCreateUser: true, emailRedirectTo: confirmUrl(), data: { full_name: name } },
  })
  return error
}

/**
 * Step 1 — staff create a user account (no self-registration). The account
 * stays pending until the user sets a password from the emailed link, or signs
 * in with Google using the same email.
 */
export async function inviteUser(
  actor: { userId: string; role: string; permissions?: string[] },
  input: { email: string; fullName: string; phone?: string; department?: string },
): Promise<{ userId: string }> {
  if (actor.role !== 'STAFF' || !actor.permissions?.includes('USERS')) {
    throw new AppError('FORBIDDEN', 'You do not have permission to create user accounts.')
  }
  const parsed = invitationSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  const { email: address, fullName, phone, department } = parsed.data
  requireSupabase()
  const existing = await db.user.findUnique({ where: { email: address } })
  if (existing) throw new AppError('CONFLICT', 'An account with this email already exists.')

  const user = await db.user.create({
    data: {
      email: address,
      name: fullName,
      role: 'USER', // assigned by the server, never taken from a form
      status: 'PENDING_VERIFICATION',
      userProfile: { create: { phone, department, integrationSource: 'supabase' } },
    },
  })
  await rateLimit(`user-email:activation:${address}`, 1, EMAIL_COOLDOWN_MINUTES * 60)
  const error = await sendActivation(address, fullName)
  if (error) {
    await db.rateLimitBucket.deleteMany({ where: { key: `user-email:activation:${address}` } })
    await audit({ actor: { userId: actor.userId, role: 'STAFF' }, action: 'user.invited', entityType: 'User', entityId: user.id, metadata: { outcome: 'email_delivery_failed' } })
    sendFailure(error)
  }
  await audit({ actor: { userId: actor.userId, role: 'STAFF' }, action: 'user.invited', entityType: 'User', entityId: user.id, metadata: { outcome: 'link_sent' } })
  return { userId: user.id }
}

/** Resend the activation email to a pending, staff-created account (silent for everything else). */
export async function resendInvitation(rawEmail: string, ip: string | null): Promise<void> {
  const parsed = emailOnlySchema.safeParse({ email: rawEmail })
  if (!parsed.success) throw new AppError('VALIDATION', 'Enter a valid email address.')
  const address = parsed.data.email
  requireSupabase()
  const user = await db.user.findUnique({ where: { email: address } })
  if (!user || user.role !== 'USER' || user.status !== 'PENDING_VERIFICATION') return
  const cooldownKey = await cooldown('activation', address, ip)
  const error = await sendActivation(address, user.name)
  if (error) {
    await releaseCooldown(cooldownKey)
    await logRequest('user.activation_resent', address, 'email_delivery_failed')
    sendFailure(error)
  }
  await logRequest('user.activation_resent', address, 'link_sent')
}

/**
 * Step 2 — the user opened the emailed link and chose a password.
 * Supabase verifies the link (expiry + single use) only now, on submit, so mail
 * scanners that pre-open links can't burn it.
 */
export async function completeUserLink(
  input: { tokenHash?: string; accessToken?: string; refreshToken?: string; type: string; password: string; confirmPassword: string },
  ip: string | null,
): Promise<{ userId: string; purpose: 'ACTIVATION' | 'PASSWORD_RESET' }> {
  const parsed = completeLinkSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  const { tokenHash, accessToken, refreshToken, type, password } = parsed.data
  requireSupabase()
  if (ip) await enforceRateLimit(`user-link-complete:${ip}`, 20, 60 * 60)

  const client = createSupabaseAuthClient()
  const { data, error } = tokenHash
    ? await client.auth.verifyOtp({ token_hash: tokenHash, type: type === 'invite' ? 'invite' : type })
    : await client.auth.setSession({ access_token: accessToken!, refresh_token: refreshToken! })
  if (error || !data.user?.email) {
    await audit({ action: 'user.link_rejected', entityType: 'User', metadata: { reason: error?.code ?? 'no_user' } })
    throw new AppError('VALIDATION', 'This link has expired or has already been used. Please request a new one.')
  }
  const sbUser = data.user
  const address = sbUser.email!.toLowerCase()

  const local = await db.user.findFirst({ where: { OR: [{ supabaseUserId: sbUser.id }, { email: address }] } })
  // No sign-up: only an account created by staff can be activated
  if (!local) {
    await client.auth.signOut()
    await audit({ action: 'user.link_rejected', entityType: 'User', metadata: { reason: 'no_account' } })
    throw new AppError('FORBIDDEN', 'Account not found. Please contact the administrator.')
  }
  if (local.role !== 'USER') {
    await client.auth.signOut()
    await audit({ action: 'user.link_rejected', entityType: 'User', entityId: local.id, metadata: { reason: 'not_a_user_account' } })
    throw new AppError('FORBIDDEN', 'This email belongs to a staff or canteen account. Please use your portal’s sign-in page.')
  }
  if (local?.status === 'DEACTIVATED') {
    await client.auth.signOut()
    throw new AppError('FORBIDDEN', 'This account has been deactivated. Please contact the canteen office.')
  }

  const { error: pwError } = await client.auth.updateUser({ password })
  if (pwError) {
    console.error('[user-auth] password update failed', pwError.code, pwError.message)
    throw new AppError(
      'VALIDATION',
      pwError.code === 'same_password'
        ? 'Choose a password different from your current one, then request a new link.'
        : 'We couldn’t save your password. Please request a new link and try again.',
    )
  }
  // CampusBite issues its own session; don't keep the Supabase one around
  await client.auth.signOut()

  const purpose: 'ACTIVATION' | 'PASSWORD_RESET' = local.status === 'ACTIVE' ? 'PASSWORD_RESET' : 'ACTIVATION'
  const now = new Date()
  const userId = await db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: local.id },
      data: { supabaseUserId: sbUser.id, status: 'ACTIVE', emailVerifiedAt: local.emailVerifiedAt ?? now, passwordHash: null, mustChangePassword: false },
    })
    await tx.userProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, integrationSource: 'supabase' } })
    // A password change signs the user out everywhere else
    await tx.session.deleteMany({ where: { userId: user.id } })
    await audit(
      {
        actor: { userId: user.id, role: 'USER' },
        action: purpose === 'ACTIVATION' ? 'user.activated' : 'user.password_reset',
        entityType: 'User',
        entityId: user.id,
        metadata: { via: 'supabase' },
      },
      tx,
    )
    return user.id
  })
  return { userId, purpose }
}

/** Step 3 — user login through Supabase Auth (legacy pre-Supabase accounts still work). */
export async function authenticateUser(
  address: string,
  password: string,
  verifyLegacyPassword: (hash: string | null) => Promise<boolean>,
): Promise<{ userId: string } | null> {
  const local = await db.user.findUnique({ where: { email: address } })
  if (local && local.role !== 'USER') return null

  // Accounts created before Supabase Auth (demo/seed data) keep their local password until reset
  if (local && !local.supabaseUserId && local.passwordHash) {
    return (await verifyLegacyPassword(local.passwordHash)) ? { userId: local.id } : null
  }
  if (!supabaseConfig().configured) return null

  const client = createSupabaseAuthClient()
  const { data, error } = await client.auth.signInWithPassword({ email: address, password })
  if (error) {
    if (error.code === 'email_not_confirmed') {
      throw new AppError('FORBIDDEN', 'Please activate your account first — use the link we emailed you.')
    }
    return null
  }
  await client.auth.signOut()
  if (!local) {
    // Verified in Supabase but never activated in CampusBite (no password step) — refuse
    throw new AppError('FORBIDDEN', 'Please activate your account first — use the link we emailed you.')
  }
  if (!local.supabaseUserId) await db.user.update({ where: { id: local.id }, data: { supabaseUserId: data.user.id } })
  return { userId: local.id }
}

/**
 * Signed-in USER changes their password (Supabase users). Checks the current
 * password with Supabase, then sets the new one on that same session.
 */
export async function changeSupabasePassword(address: string, currentPassword: string, newPassword: string): Promise<'ok' | 'wrong_current'> {
  requireSupabase()
  const client = createSupabaseAuthClient()
  const { error } = await client.auth.signInWithPassword({ email: address, password: currentPassword })
  if (error) return 'wrong_current'
  const { error: updateError } = await client.auth.updateUser({ password: newPassword })
  await client.auth.signOut().catch(() => undefined)
  if (updateError) {
    console.error('[user-auth] password change failed', updateError.code, updateError.message)
    throw new AppError('VALIDATION', 'We couldn’t change your password. Please try a different one.')
  }
  return 'ok'
}
