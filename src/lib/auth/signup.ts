import 'server-only'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import { enforceRateLimit, rateLimit } from './rate-limit'
import { passwordSchema } from './password'
import { createSupabaseAuthClient, supabaseConfig } from './supabase'

// ===========================================================================
// Public sign-up with a Gmail address + password, verified by a 6-digit code.
//
//  1. startSignup   — server validates (Gmail only, strong password), keeps a
//     pending USER account, and Supabase Auth stores the password (hashed by
//     Supabase) and emails a one-time code (Email OTP expiry: 15 minutes).
//  2. verifySignup  — the user types the code; Supabase confirms the address.
//     Only now is the account ACTIVE. Later sign-ins are plain email+password.
//  A Gmail address that *looks* valid proves nothing about who owns the inbox;
//  the emailed code is what proves it. The role is always USER, set here.
// ===========================================================================

/** Gmail addresses: 6–30 letters, digits or dots (plus optional +tag), ending in @gmail.com. */
const GMAIL = /^(?=.{6,64}@)(?!.*\.\.)[a-z0-9](?:[a-z0-9.]*[a-z0-9])?(?:\+[a-z0-9._-]{1,30})?@gmail\.com$/

export const gmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email('Enter a valid email address')
  .refine((v) => GMAIL.test(v), 'Only Gmail addresses (ending in @gmail.com) can be used to sign up.')

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(80, 'Name is too long'),
    email: gmailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })

const codeSchema = z.string().trim().regex(/^\d{6,10}$/, 'Enter the code from the email.')

function requireSupabase() {
  if (!supabaseConfig().configured) throw new AppError('UNAVAILABLE', 'Sign-up is temporarily unavailable. Please try again later.')
}

function deliveryError(e: { code?: string; status?: number }): never {
  if (e.status === 429 || e.code === 'over_email_send_rate_limit') {
    throw new AppError('RATE_LIMITED', 'Too many emails were requested. Please wait a minute and try again.')
  }
  if (e.code === 'email_address_invalid') throw new AppError('VALIDATION', 'Enter a valid Gmail address.')
  if (e.code === 'weak_password') throw new AppError('VALIDATION', 'Choose a stronger password.')
  console.error('[signup] Supabase error', e.code, e.status)
  throw new AppError('UNAVAILABLE', 'We couldn’t send the code right now. Please try again in a few minutes.')
}

/** Step 1. Returns the normalised email the code was sent to. */
export async function startSignup(
  input: { fullName: string; email: string; password: string; confirmPassword: string },
  ip: string | null,
): Promise<{ email: string }> {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  const { fullName, email, password } = parsed.data
  requireSupabase()
  if (ip) await enforceRateLimit(`signup-ip:${ip}`, 10, 60 * 60)
  await enforceRateLimit(`signup-email:${email}`, 5, 60 * 60)

  const existing = await db.user.findUnique({ where: { email } })
  if (existing && (existing.role !== 'USER' || existing.status === 'DEACTIVATED')) {
    throw new AppError('CONFLICT', 'This email can’t be used to sign up. Please contact the canteen office.')
  }
  if (existing?.status === 'ACTIVE') {
    throw new AppError('CONFLICT', 'An account with this email already exists. Sign in, or use Forgot Password.')
  }

  // One code email per minute per address
  const sendGuard = await rateLimit(`signup-send:${email}`, 1, 60)
  if (!sendGuard.ok) throw new AppError('RATE_LIMITED', `We just sent a code. You can request another in ${sendGuard.retryAfterSeconds} seconds.`)

  const sb = createSupabaseAuthClient().auth
  const { data, error } = await sb.signUp({ email, password, options: { data: { full_name: fullName } } })
  if (error) {
    await db.rateLimitBucket.deleteMany({ where: { key: `signup-send:${email}` } })
    if (error.code === 'user_already_exists') {
      throw new AppError('CONFLICT', 'An account with this email already exists. Sign in, or use Forgot Password.')
    }
    deliveryError(error)
  }
  // An unconfirmed Supabase user from an earlier attempt: Supabase returns a user with no new
  // identity and sends nothing, so ask it to send the code again
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    const r = await sb.resend({ type: 'signup', email })
    if (r.error) deliveryError(r.error)
  }

  await db.user.upsert({
    where: { email },
    update: { name: fullName },
    create: {
      email,
      name: fullName,
      role: 'USER', // never chosen by the user
      status: 'PENDING_VERIFICATION',
      userProfile: { create: { integrationSource: 'supabase' } },
    },
  })
  await audit({ action: 'user.signup_started', entityType: 'User', metadata: { outcome: 'code_sent' } })
  return { email }
}

/** Step 2. The 6-digit code proves the inbox. Returns the activated user. */
export async function verifySignup(input: { email: string; code: string }, ip: string | null): Promise<{ userId: string }> {
  const email = gmailSchema.safeParse(input.email)
  const code = codeSchema.safeParse(input.code)
  if (!email.success) throw new AppError('VALIDATION', 'Enter a valid Gmail address.')
  if (!code.success) throw new AppError('VALIDATION', code.error.issues[0]?.message ?? 'Enter the code from the email.')
  requireSupabase()
  if (ip) await enforceRateLimit(`signup-verify-ip:${ip}`, 30, 15 * 60)
  await enforceRateLimit(`signup-verify:${email.data}`, 8, 15 * 60) // guessing codes is pointless

  const local = await db.user.findUnique({ where: { email: email.data } })
  if (!local || local.role !== 'USER' || local.status === 'DEACTIVATED') {
    throw new AppError('VALIDATION', 'That code is wrong or has expired. Request a new code.')
  }
  const client = createSupabaseAuthClient()
  let r = await client.auth.verifyOtp({ email: email.data, token: code.data, type: 'email' })
  if (r.error) r = await client.auth.verifyOtp({ email: email.data, token: code.data, type: 'signup' })
  if (r.error || !r.data.user) {
    await audit({ action: 'user.signup_code_rejected', entityType: 'User', entityId: local.id, metadata: { reason: r.error?.code ?? 'no_user' } })
    throw new AppError('VALIDATION', 'That code is wrong or has expired. Request a new code.')
  }
  await client.auth.signOut().catch(() => undefined) // CampusBite issues its own session

  const now = new Date()
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: local.id },
      data: { supabaseUserId: r.data.user!.id, status: 'ACTIVE', emailVerifiedAt: local.emailVerifiedAt ?? now, passwordHash: null, lastLoginAt: now },
    })
    await tx.userProfile.upsert({ where: { userId: local.id }, update: {}, create: { userId: local.id, integrationSource: 'supabase' } })
    await audit({ actor: { userId: local.id, role: 'USER' }, action: 'user.activated', entityType: 'User', entityId: local.id, metadata: { via: 'email_code' } }, tx)
  })
  return { userId: local.id }
}

/** Send the sign-up code again (pending accounts only; silent otherwise). */
export async function resendSignupCode(rawEmail: string, ip: string | null): Promise<void> {
  const parsed = gmailSchema.safeParse(rawEmail)
  if (!parsed.success) throw new AppError('VALIDATION', 'Enter a valid Gmail address.')
  requireSupabase()
  if (ip) await enforceRateLimit(`signup-ip:${ip}`, 10, 60 * 60)
  const user = await db.user.findUnique({ where: { email: parsed.data } })
  if (!user || user.role !== 'USER' || user.status !== 'PENDING_VERIFICATION') return
  const guard = await rateLimit(`signup-send:${parsed.data}`, 1, 60)
  if (!guard.ok) throw new AppError('RATE_LIMITED', `Please wait ${guard.retryAfterSeconds} seconds before requesting another code.`)
  const { error } = await createSupabaseAuthClient().auth.resend({ type: 'signup', email: parsed.data })
  if (error) {
    await db.rateLimitBucket.deleteMany({ where: { key: `signup-send:${parsed.data}` } })
    deliveryError(error)
  }
}
