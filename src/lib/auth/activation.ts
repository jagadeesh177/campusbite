import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { StudentTokenPurpose } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { env } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { sendEmail, studentLinkEmail } from '@/lib/email'
import { getCollegeProvider, isAllowedCollegeEmail } from '@/lib/college'
import { enforceRateLimit } from './rate-limit'
import { hashPassword, passwordSchema } from './password'

// ===========================================================================
//  Student account activation & password reset via single-use email links.
//
//  1. requestStudentLink(): the college provider confirms the email belongs to
//     an eligible student; a random 256-bit token is emailed as a link and
//     only its SHA-256 hash is stored (30-minute expiry).
//  2. inspectStudentToken(): the link page checks the token before showing
//     the password form.
//  3. completeStudentToken(): re-validates the token, re-checks eligibility,
//     consumes the token atomically (single use) and sets the password.
//
//  The public response never reveals whether an email is a student or has an
//  account (no enumeration). Outcomes are recorded in the audit log without
//  tokens or passwords.
// ===========================================================================

/** Links last 15 minutes, and only one link per email can be active at a time (one email per 15 minutes). */
export const LINK_TTL_MINUTES = 15

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254)

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, 'This link is invalid.')

export const setPasswordSchema = z
  .object({
    token: tokenSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/** Domain only — avoids logging arbitrary personal emails people type in. */
function emailDomain(email: string) {
  return email.split('@')[1] ?? 'unknown'
}

async function auditRequest(purpose: StudentTokenPurpose, email: string, outcome: string, logEmail: boolean) {
  await audit({
    action: purpose === 'ACTIVATION' ? 'student.activation_requested' : 'student.password_reset_requested',
    entityType: 'StudentAccessToken',
    metadata: { outcome, ...(logEmail ? { email } : { domain: emailDomain(email) }) },
  })
}

export function linkFor(token: string) {
  return `${env.appUrl.replace(/\/$/, '')}/activate/confirm?token=${token}`
}

/**
 * Step 1. Resolves the same way whether or not the email is eligible, so the
 * caller can always show one generic message. Throws only for input errors,
 * rate limits, or when the college system / email service is unavailable.
 */
export async function requestStudentLink(
  purpose: StudentTokenPurpose,
  rawEmail: string,
  ip: string | null,
): Promise<void> {
  const parsed = emailSchema.safeParse(rawEmail)
  if (!parsed.success) throw new AppError('VALIDATION', 'Enter a valid email address.')
  const email = parsed.data

  if (ip) await enforceRateLimit(`student-link-ip:${ip}`, 20, 60 * 60)
  await enforceRateLimit(`student-link:${purpose}:${email}`, 5, 60 * 60)

  // Personal addresses (gmail etc.) can never become student accounts
  if (!isAllowedCollegeEmail(email)) {
    await auditRequest(purpose, email, 'domain_not_allowed', false)
    throw new AppError('VALIDATION', 'Please use your official college email address.')
  }

  const existing = await db.user.findUnique({ where: { email } })
  if (purpose === 'ACTIVATION' && existing && (existing.role !== 'STUDENT' || existing.status !== 'PENDING_VERIFICATION')) {
    await auditRequest(purpose, email, existing.role === 'STUDENT' ? 'already_active' : 'not_a_student_account', true)
    return
  }
  if (purpose === 'PASSWORD_RESET' && (!existing || existing.role !== 'STUDENT' || existing.status !== 'ACTIVE')) {
    await auditRequest(purpose, email, 'no_active_student_account', !!existing)
    return
  }

  const verification = await getCollegeProvider().verifyStudent(email)
  if (!verification.eligible) {
    if (verification.reason === 'PROVIDER_UNAVAILABLE') {
      await auditRequest(purpose, email, 'college_system_unavailable', false)
      throw new AppError('UNAVAILABLE', 'College verification is temporarily unavailable. Please try again shortly.')
    }
    await auditRequest(purpose, email, verification.reason === 'NOT_ENROLLED' ? 'not_enrolled' : 'not_found', verification.reason === 'NOT_ENROLLED')
    return
  }

  // Cooldown: while a link is still valid (unused, not expired), don't send another email.
  // The response stays the same "check your inbox" message, so this reveals nothing.
  const active = await db.studentAccessToken.findFirst({
    where: { email, purpose, usedAt: null, invalidatedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  })
  if (active) {
    await auditRequest(purpose, email, 'cooldown_link_still_valid', true)
    return
  }

  const token = randomBytes(32).toString('base64url')
  const record = await db.$transaction(async (tx) => {
    // Defensive: make sure no older link stays usable once a new one exists
    await tx.studentAccessToken.updateMany({
      where: { email, purpose, usedAt: null, invalidatedAt: null },
      data: { invalidatedAt: new Date() },
    })
    return tx.studentAccessToken.create({
      data: {
        tokenHash: hashToken(token),
        purpose,
        email,
        externalStudentId: verification.studentId,
        expiresAt: new Date(Date.now() + LINK_TTL_MINUTES * 60_000),
      },
    })
  })

  try {
    await sendEmail({ to: email, ...studentLinkEmail(purpose, linkFor(token), LINK_TTL_MINUTES) })
  } catch (e) {
    console.error('[activation] email delivery failed', e)
    await db.studentAccessToken.update({ where: { id: record.id }, data: { invalidatedAt: new Date() } })
    await auditRequest(purpose, email, 'email_delivery_failed', true)
    throw new AppError('UNAVAILABLE', 'We could not send the email right now. Please try again in a few minutes.')
  }
  await auditRequest(purpose, email, 'link_sent', true)
}

export type TokenInspection =
  | { valid: true; purpose: StudentTokenPurpose; email: string; expiresAt: Date }
  | { valid: false; reason: 'invalid' | 'expired' | 'used' }

/** Step 2 (read-only): lets the link page show the right state. */
export async function inspectStudentToken(token: string | undefined | null): Promise<TokenInspection> {
  if (!token || !tokenSchema.safeParse(token).success) return { valid: false, reason: 'invalid' }
  const row = await db.studentAccessToken.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!row) return { valid: false, reason: 'invalid' }
  if (row.usedAt || row.invalidatedAt) return { valid: false, reason: 'used' }
  if (row.expiresAt < new Date()) return { valid: false, reason: 'expired' }
  return { valid: true, purpose: row.purpose, email: row.email, expiresAt: row.expiresAt }
}

const FAILURE_MESSAGE = {
  invalid: 'This link is invalid. Please request a new one.',
  expired: 'This link has expired. Please request a new one.',
  used: 'This link has already been used. Please request a new one.',
} as const

/**
 * Step 3. Sets the password and activates (or resets) the account. The role is
 * always STUDENT — assigned here on the server, never taken from the request.
 */
export async function completeStudentToken(
  input: z.input<typeof setPasswordSchema>,
  ip: string | null,
): Promise<{ userId: string; purpose: StudentTokenPurpose }> {
  const parsed = setPasswordSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid details')
  const { token, password } = parsed.data
  if (ip) await enforceRateLimit(`student-link-complete:${ip}`, 20, 60 * 60)

  const inspection = await inspectStudentToken(token)
  if (!inspection.valid) {
    await audit({ action: 'student.link_rejected', entityType: 'StudentAccessToken', metadata: { reason: inspection.reason } })
    throw new AppError('VALIDATION', FAILURE_MESSAGE[inspection.reason])
  }
  const row = await db.studentAccessToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } })

  // Re-confirm with the college at the moment of activation
  const provider = getCollegeProvider()
  const verification = await provider.verifyStudent(row.email)
  if (!verification.eligible || verification.studentId !== row.externalStudentId) {
    await audit({ action: 'student.link_rejected', entityType: 'StudentAccessToken', metadata: { reason: 'no_longer_eligible', email: row.email } })
    throw new AppError('FORBIDDEN', 'We could not confirm your enrollment with college records.')
  }
  const record = await provider.getStudentProfile(row.externalStudentId)
  if (!record) throw new AppError('UNAVAILABLE', 'College records are temporarily unavailable. Please try again.')
  const passwordHash = await hashPassword(password)

  const userId = await db.$transaction(async (tx) => {
    // Atomic single-use claim: concurrent submissions of the same link can't both win
    const claimed = await tx.studentAccessToken.updateMany({
      where: { id: row.id, usedAt: null, invalidatedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    })
    if (!claimed.count) throw new AppError('CONFLICT', FAILURE_MESSAGE.used)

    const existing = await tx.user.findUnique({ where: { email: row.email } })
    const now = new Date()

    if (row.purpose === 'PASSWORD_RESET') {
      if (!existing || existing.role !== 'STUDENT' || existing.status !== 'ACTIVE') {
        throw new AppError('FORBIDDEN', 'This account cannot be reset. Please contact the canteen office.')
      }
      await tx.user.update({ where: { id: existing.id }, data: { passwordHash, mustChangePassword: false } })
      await tx.session.deleteMany({ where: { userId: existing.id } }) // sign out everywhere
      await audit({ actor: { userId: existing.id, role: 'STUDENT' }, action: 'student.password_reset_completed', entityType: 'User', entityId: existing.id }, tx)
      return existing.id
    }

    if (existing && existing.status !== 'PENDING_VERIFICATION') {
      throw new AppError('CONFLICT', 'This account is already active. Please sign in.')
    }
    const clash = await tx.studentProfile.findUnique({ where: { externalStudentId: record.studentId } })
    if (clash && clash.userId !== existing?.id) {
      throw new AppError('CONFLICT', 'This student ID is already linked to another account. Please contact the canteen office.')
    }

    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { name: record.fullName, passwordHash, status: 'ACTIVE', emailVerifiedAt: now, mustChangePassword: false },
        })
      : await tx.user.create({
          data: { email: row.email, name: record.fullName, role: 'STUDENT', status: 'ACTIVE', passwordHash, emailVerifiedAt: now },
        })
    const profile = {
      department: record.department,
      programme: record.programme,
      yearOfStudy: record.yearOfStudy,
      enrollmentStatus: record.enrollmentStatus,
      enrollmentCheckedAt: now,
    }
    await tx.studentProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, externalStudentId: record.studentId, integrationSource: provider.id, ...profile },
      update: profile,
    })
    await audit(
      { actor: { userId: user.id, role: 'STUDENT' }, action: 'student.activated', entityType: 'User', entityId: user.id, metadata: { source: provider.id } },
      tx,
    )
    return user.id
  })

  return { userId, purpose: row.purpose }
}
