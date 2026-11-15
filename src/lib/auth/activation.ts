import 'server-only'
import { createHash, randomInt } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import { sendEmail } from '@/lib/email'
import { getCollegeProvider, isAllowedCollegeEmail } from '@/lib/college'
import { safeEqualHex } from '@/lib/payments/signatures'
import { enforceRateLimit } from './rate-limit'
import { hashPassword, passwordSchema } from './password'

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_CODE_ATTEMPTS = 5

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254)

export const completeActivationSchema = z
  .object({
    email: emailSchema,
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

function hashCode(email: string, code: string) {
  return createHash('sha256').update(`${email}:${code}`).digest('hex')
}

/**
 * Step 1. Always behaves the same from the outside (no account enumeration):
 * a code is emailed only if the college confirms an enrolled student.
 */
export async function startStudentActivation(rawEmail: string, ip: string | null): Promise<void> {
  const parsed = emailSchema.safeParse(rawEmail)
  if (!parsed.success) throw new AppError('VALIDATION', 'Enter a valid email address.')
  const email = parsed.data

  if (ip) await enforceRateLimit(`activate-ip:${ip}`, 20, 60 * 60)
  await enforceRateLimit(`activate:${email}`, 3, 60 * 60)

  // Personal emails (gmail etc.) can never become student accounts
  if (!isAllowedCollegeEmail(email)) {
    throw new AppError('VALIDATION', 'Please use your official college email address.')
  }

  const existing = await db.user.findUnique({ where: { email } })
  if (existing && (existing.role !== 'STUDENT' || existing.status !== 'PENDING_VERIFICATION')) return

  const verification = await getCollegeProvider().verifyStudent(email)
  if (!verification.eligible) {
    if (verification.reason === 'PROVIDER_UNAVAILABLE') {
      throw new AppError('UNAVAILABLE', 'College verification is temporarily unavailable. Please try again shortly.')
    }
    return
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db.$transaction([
    db.verificationCode.deleteMany({ where: { email, purpose: 'STUDENT_ACTIVATION', consumedAt: null } }),
    db.verificationCode.create({
      data: {
        email,
        purpose: 'STUDENT_ACTIVATION',
        codeHash: hashCode(email, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    }),
  ])
  await sendEmail({
    to: email,
    subject: 'Your CampusBite activation code',
    text: `Your CampusBite activation code is ${code}.\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.`,
  })
}

/** Step 2: verify code, re-confirm eligibility, create the local account. */
export async function completeStudentActivation(
  input: z.input<typeof completeActivationSchema>,
): Promise<{ userId: string }> {
  const parsed = completeActivationSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid details')
  const { email, code, password } = parsed.data

  await enforceRateLimit(`activate-verify:${email}`, 10, 60 * 60)

  const vc = await db.verificationCode.findFirst({
    where: { email, purpose: 'STUDENT_ACTIVATION', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!vc || vc.expiresAt < new Date()) {
    throw new AppError('VALIDATION', 'This code has expired. Please request a new one.')
  }
  if (vc.attempts >= MAX_CODE_ATTEMPTS) {
    throw new AppError('RATE_LIMITED', 'Too many incorrect attempts. Please request a new code.')
  }
  if (!safeEqualHex(hashCode(email, code), vc.codeHash)) {
    await db.verificationCode.update({ where: { id: vc.id }, data: { attempts: { increment: 1 } } })
    throw new AppError('VALIDATION', 'That code is incorrect.')
  }

  // Re-check with the college at the moment of activation
  const provider = getCollegeProvider()
  const verification = await provider.verifyStudent(email)
  if (!verification.eligible) {
    throw new AppError('FORBIDDEN', 'We could not confirm your enrollment with college records.')
  }
  const record = await provider.getStudentProfile(verification.studentId)
  if (!record) throw new AppError('UNAVAILABLE', 'College records are temporarily unavailable. Please try again.')
  const passwordHash = await hashPassword(password)

  return db.$transaction(async (tx) => {
    const consumed = await tx.verificationCode.updateMany({
      where: { id: vc.id, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    if (!consumed.count) throw new AppError('CONFLICT', 'This code was already used.')

    const clash = await tx.studentProfile.findUnique({ where: { externalStudentId: record.studentId } })
    const existing = await tx.user.findUnique({ where: { email } })
    if (existing && existing.status !== 'PENDING_VERIFICATION') {
      throw new AppError('CONFLICT', 'This account is already active. Please sign in.')
    }
    if (clash && clash.userId !== existing?.id) {
      throw new AppError('CONFLICT', 'This student ID is already linked to another account. Contact the canteen office.')
    }

    const now = new Date()
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { name: record.fullName, passwordHash, status: 'ACTIVE', emailVerifiedAt: now },
        })
      : await tx.user.create({
          data: {
            email,
            name: record.fullName,
            role: 'STUDENT',
            status: 'ACTIVE',
            passwordHash,
            emailVerifiedAt: now,
          },
        })
    await tx.studentProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        externalStudentId: record.studentId,
        integrationSource: provider.id,
        department: record.department,
        programme: record.programme,
        yearOfStudy: record.yearOfStudy,
        enrollmentStatus: record.enrollmentStatus,
        enrollmentCheckedAt: now,
      },
      update: {
        department: record.department,
        programme: record.programme,
        yearOfStudy: record.yearOfStudy,
        enrollmentStatus: record.enrollmentStatus,
        enrollmentCheckedAt: now,
      },
    })
    await audit(
      {
        actor: { userId: user.id, role: 'STUDENT' },
        action: 'student.activated',
        entityType: 'User',
        entityId: user.id,
        metadata: { source: provider.id },
      },
      tx,
    )
    return { userId: user.id }
  })
}
