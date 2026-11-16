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
 * Student self-registration with ANY personal email, backed by Supabase Auth.
 *
 *  1. registerStudent      → pending CampusBite account + Supabase emails an activation link
 *  2. completeStudentLink  → link verified by Supabase (single use, expires), password set,
 *                            account activated with the STUDENT role (assigned here, server-side)
 *  3. authenticateStudent  → Supabase checks the password, CampusBite issues its own session
 *
 * No college email rule and no college database lookup is involved.
 */

/** One email per address per 15 minutes; the link itself also expires (Supabase "Email OTP expiry"). */
export const EMAIL_COOLDOWN_MINUTES = 15

const email = z.string().trim().toLowerCase().max(254).email('Enter a valid email address')

export const registrationSchema = z.object({
  email,
  fullName: z.string().trim().min(2, 'Enter your full name').max(80, 'Name is too long'),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')),
  department: z.string().trim().max(80).optional().transform((v) => v || undefined),
})

export const emailOnlySchema = z.object({ email })

const LINK_TYPES = ['email', 'recovery', 'signup', 'magiclink', 'invite'] as const
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
    throw new AppError('UNAVAILABLE', 'Student sign-up is temporarily unavailable. Please try again later.')
  }
}

const confirmUrl = () => `${env.appUrl}/auth/confirm`

async function cooldown(kind: string, address: string, ip: string | null): Promise<string> {
  if (ip) await enforceRateLimit(`student-email-ip:${ip}`, 10, 60 * 60)
  const key = `student-email:${kind}:${address}`
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

/** If the email could not be sent, don't make the student wait out the cooldown. */
const releaseCooldown = (key: string) => db.rateLimitBucket.deleteMany({ where: { key } })

function sendFailure(e: { code?: string; status?: number; message?: string }): never {
  if (e.code === 'over_email_send_rate_limit' || e.status === 429) {
    throw new AppError('RATE_LIMITED', 'Too many emails were requested. Please wait a few minutes and try again.')
  }
  if (e.code === 'email_address_invalid') throw new AppError('VALIDATION', 'Enter a valid email address.')
  console.error('[student-auth] Supabase could not send the email', e.code, e.status, e.message)
  throw new AppError('UNAVAILABLE', 'We couldn’t send the email right now. Please try again in a few minutes.')
}

async function logRequest(action: string, address: string, outcome: string) {
  await audit({ action, entityType: 'User', metadata: { outcome, email: address } })
}

/** Step 1 — register (or resend the activation email for a pending registration). */
export async function registerStudent(
  input: { email: string; fullName: string; phone: string; department?: string },
  ip: string | null,
): Promise<void> {
  const parsed = registrationSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  const { email: address, fullName, phone, department } = parsed.data
  requireSupabase()
  const cooldownKey = await cooldown('activation', address, ip)

  const existing = await db.user.findUnique({ where: { email: address }, include: { studentProfile: true } })
  // Staff/canteen emails can never become student accounts; active students should sign in.
  // The response stays the same ("check your inbox") so the form never reveals who has an account.
  if (existing && (existing.role !== 'STUDENT' || existing.status !== 'PENDING_VERIFICATION')) {
    await logRequest('student.registration_requested', address,
      existing.role !== 'STUDENT' ? 'not_a_student_account' : existing.status === 'ACTIVE' ? 'already_registered' : 'deactivated')
    return
  }

  // Pending CampusBite account — cannot sign in until the email is verified and a password is set
  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        name: fullName,
        studentProfile: existing.studentProfile
          ? { update: { phone, department: department ?? null } }
          : { create: { phone, department, integrationSource: 'supabase' } },
      },
    })
  } else {
    await db.user.create({
      data: {
        email: address,
        name: fullName,
        role: 'STUDENT', // assigned by the server, never taken from the form
        status: 'PENDING_VERIFICATION',
        studentProfile: { create: { phone, department, integrationSource: 'supabase' } },
      },
    })
  }

  const { error } = await createSupabaseAuthClient().auth.signInWithOtp({
    email: address,
    options: { shouldCreateUser: true, emailRedirectTo: confirmUrl(), data: { full_name: fullName } },
  })
  if (error) {
    await releaseCooldown(cooldownKey)
    await logRequest('student.registration_requested', address, 'email_delivery_failed')
    sendFailure(error)
  }
  await logRequest('student.registration_requested', address, 'link_sent')
}

/** Students only. Sends a single-use reset link; silent for unknown / non-student emails. */
export async function requestStudentPasswordReset(rawEmail: string, ip: string | null): Promise<void> {
  const parsed = emailOnlySchema.safeParse({ email: rawEmail })
  if (!parsed.success) throw new AppError('VALIDATION', 'Enter a valid email address.')
  const address = parsed.data.email
  requireSupabase()
  const cooldownKey = await cooldown('reset', address, ip)

  const user = await db.user.findUnique({ where: { email: address } })
  if (!user || user.role !== 'STUDENT' || user.status !== 'ACTIVE') {
    await logRequest('student.password_reset_requested', address, 'no_active_student_account')
    return
  }

  const sb = createSupabaseAuthClient().auth
  // Students created before Supabase (no Supabase user yet) get a one-time sign-in link instead,
  // which lands on the same "set a new password" page and links the account to Supabase.
  const { error } = user.supabaseUserId
    ? await sb.resetPasswordForEmail(address, { redirectTo: confirmUrl() })
    : await sb.signInWithOtp({ email: address, options: { shouldCreateUser: true, emailRedirectTo: confirmUrl(), data: { full_name: user.name } } })
  if (error) {
    await releaseCooldown(cooldownKey)
    await logRequest('student.password_reset_requested', address, 'email_delivery_failed')
    sendFailure(error)
  }
  await logRequest('student.password_reset_requested', address, 'link_sent')
}

/**
 * Step 2 — the student opened the emailed link and chose a password.
 * Supabase verifies the link (expiry + single use) only now, on submit, so mail
 * scanners that pre-open links can't burn it.
 */
export async function completeStudentLink(
  input: { tokenHash?: string; accessToken?: string; refreshToken?: string; type: string; password: string; confirmPassword: string },
  ip: string | null,
): Promise<{ userId: string; purpose: 'ACTIVATION' | 'PASSWORD_RESET' }> {
  const parsed = completeLinkSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  const { tokenHash, accessToken, refreshToken, type, password } = parsed.data
  requireSupabase()
  if (ip) await enforceRateLimit(`student-link-complete:${ip}`, 20, 60 * 60)

  const client = createSupabaseAuthClient()
  const { data, error } = tokenHash
    ? await client.auth.verifyOtp({ token_hash: tokenHash, type: type === 'invite' ? 'invite' : type })
    : await client.auth.setSession({ access_token: accessToken!, refresh_token: refreshToken! })
  if (error || !data.user?.email) {
    await audit({ action: 'student.link_rejected', entityType: 'User', metadata: { reason: error?.code ?? 'no_user' } })
    throw new AppError('VALIDATION', 'This link has expired or has already been used. Please request a new one.')
  }
  const sbUser = data.user
  const address = sbUser.email!.toLowerCase()

  const local = await db.user.findFirst({ where: { OR: [{ supabaseUserId: sbUser.id }, { email: address }] } })
  if (local && local.role !== 'STUDENT') {
    await client.auth.signOut()
    await audit({ action: 'student.link_rejected', entityType: 'User', entityId: local.id, metadata: { reason: 'not_a_student_account' } })
    throw new AppError('FORBIDDEN', 'This email belongs to a staff or canteen account. Please use your portal’s sign-in page.')
  }
  if (local?.status === 'DEACTIVATED') {
    await client.auth.signOut()
    throw new AppError('FORBIDDEN', 'This account has been deactivated. Please contact the canteen office.')
  }

  const { error: pwError } = await client.auth.updateUser({ password })
  if (pwError) {
    console.error('[student-auth] password update failed', pwError.code, pwError.message)
    throw new AppError(
      'VALIDATION',
      pwError.code === 'same_password'
        ? 'Choose a password different from your current one, then request a new link.'
        : 'We couldn’t save your password. Please request a new link and try again.',
    )
  }
  // CampusBite issues its own session; don't keep the Supabase one around
  await client.auth.signOut()

  const purpose: 'ACTIVATION' | 'PASSWORD_RESET' = local?.status === 'ACTIVE' ? 'PASSWORD_RESET' : 'ACTIVATION'
  const now = new Date()
  const fullName = (typeof sbUser.user_metadata?.full_name === 'string' && sbUser.user_metadata.full_name) || address.split('@')[0]

  const userId = await db.$transaction(async (tx) => {
    const user = local
      ? await tx.user.update({
          where: { id: local.id },
          data: { supabaseUserId: sbUser.id, status: 'ACTIVE', emailVerifiedAt: local.emailVerifiedAt ?? now, passwordHash: null, mustChangePassword: false },
        })
      : await tx.user.create({
          data: { email: address, name: fullName, role: 'STUDENT', status: 'ACTIVE', supabaseUserId: sbUser.id, emailVerifiedAt: now },
        })
    await tx.studentProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, integrationSource: 'supabase' } })
    // A password change signs the student out everywhere else
    await tx.session.deleteMany({ where: { userId: user.id } })
    await audit(
      {
        actor: { userId: user.id, role: 'STUDENT' },
        action: purpose === 'ACTIVATION' ? 'student.activated' : 'student.password_reset',
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

/** Step 3 — student login through Supabase Auth (legacy pre-Supabase accounts still work). */
export async function authenticateStudent(
  address: string,
  password: string,
  verifyLegacyPassword: (hash: string | null) => Promise<boolean>,
): Promise<{ userId: string } | null> {
  const local = await db.user.findUnique({ where: { email: address } })
  if (local && local.role !== 'STUDENT') return null

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
