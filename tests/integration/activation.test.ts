import { beforeEach, describe, expect, it } from 'vitest'
import { completeStudentToken, inspectStudentToken, requestStudentLink } from '@/lib/auth/activation'
import { authenticate } from '@/lib/auth/login'
import { AppError } from '@/lib/errors'
import { createStaff, createStudent, prisma, resetDb, TEST_PASSWORD } from '../helpers'

// Mock college directory (src/lib/college/mock-provider.ts):
//   neha.rao@college.edu, karan.mehta@college.edu — enrolled, not yet activated
//   old.graduate@college.edu — NOT enrolled

const NEW_PW = 'Campus2026!'

beforeEach(resetDb)

async function expectAppError(p: Promise<unknown>, code: AppError['code'], message?: RegExp) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof AppError && e.code === code && (!message || message.test(e.message)),
  )
}

async function mailsTo(email: string) {
  return prisma.devMailMessage.findMany({ where: { to: email }, orderBy: { createdAt: 'asc' } })
}

function tokenFrom(body: string) {
  const m = /\/activate\/confirm\?token=([A-Za-z0-9_-]+)/.exec(body)
  if (!m) throw new Error('no activation link in email')
  return m[1]
}

async function requestAndGetToken(email = 'neha.rao@college.edu') {
  await requestStudentLink('ACTIVATION', email, null)
  const mails = await mailsTo(email)
  return tokenFrom(mails[mails.length - 1].body)
}

describe('1. valid college student email', () => {
  it('emails a single-use activation link and stores only a hash of the token', async () => {
    await requestStudentLink('ACTIVATION', '  Neha.Rao@College.edu ', null) // normalised
    const [mail] = await mailsTo('neha.rao@college.edu')
    expect(mail.subject).toBe('Activate Your CampusBite Account')
    expect(mail.body).toContain('Welcome to CampusBite!')
    expect(mail.body).toContain('Your college email has been verified successfully.')
    expect(mail.body).toMatch(/can only be used once/)
    const token = tokenFrom(mail.body)
    expect(token.length).toBeGreaterThanOrEqual(43) // 256 bits, base64url

    const row = await prisma.studentAccessToken.findFirstOrThrow()
    expect(row.tokenHash).not.toContain(token)
    expect(JSON.stringify(row)).not.toContain(token)
    expect(row.externalStudentId).toBe('24CS031')
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60_000)
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000)

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'student.activation_requested' } })
    expect(audit.metadata).toMatchObject({ outcome: 'link_sent' })
    expect(JSON.stringify(audit.metadata)).not.toContain(token)
  })
})

describe('2. email not found in college records', () => {
  it('responds exactly like success but sends nothing (no enumeration)', async () => {
    await expect(requestStudentLink('ACTIVATION', 'not.a.student@college.edu', null)).resolves.toBeUndefined()
    await expect(requestStudentLink('ACTIVATION', 'old.graduate@college.edu', null)).resolves.toBeUndefined()
    expect(await prisma.devMailMessage.count()).toBe(0)
    expect(await prisma.studentAccessToken.count()).toBe(0)
    const outcomes = (await prisma.auditLog.findMany()).map((a) => (a.metadata as { outcome: string }).outcome).sort()
    expect(outcomes).toEqual(['not_enrolled', 'not_found'])
    // Unknown emails are logged by domain only
    const notFound = await prisma.auditLog.findFirstOrThrow({ where: { metadata: { path: ['outcome'], equals: 'not_found' } } })
    expect(JSON.stringify(notFound.metadata)).not.toContain('not.a.student')
  })
})

describe('3. invalid email format', () => {
  it('rejects malformed and non-college emails', async () => {
    await expectAppError(requestStudentLink('ACTIVATION', 'not-an-email', null), 'VALIDATION')
    await expectAppError(requestStudentLink('ACTIVATION', 'someone@gmail.com', null), 'VALIDATION', /official college email/)
    expect(await prisma.devMailMessage.count()).toBe(0)
  })
})

describe('4. duplicate activation request', () => {
  it('a newer link replaces the older one, and requests are rate-limited', async () => {
    const first = await requestAndGetToken()
    const second = await requestAndGetToken()
    expect(first).not.toBe(second)
    expect(await inspectStudentToken(first)).toEqual({ valid: false, reason: 'used' })
    expect((await inspectStudentToken(second)).valid).toBe(true)
    await expectAppError(completeStudentToken({ token: first, password: NEW_PW, confirmPassword: NEW_PW }, null), 'VALIDATION')

    await requestStudentLink('ACTIVATION', 'neha.rao@college.edu', null) // 3rd within the hour
    await expectAppError(requestStudentLink('ACTIVATION', 'neha.rao@college.edu', null), 'RATE_LIMITED')
  })

  it('already-active accounts and staff emails get no link', async () => {
    const s = await createStudent({ email: 'active.student@college.edu' })
    const staff = await createStaff()
    await requestStudentLink('ACTIVATION', s.user.email, null)
    await requestStudentLink('ACTIVATION', staff.user.email, null)
    expect(await prisma.devMailMessage.count()).toBe(0)
  })
})

describe('5. activation email delivery', () => {
  it('delivers through the configured provider (dev outbox) with a working link', async () => {
    const token = await requestAndGetToken()
    expect((await inspectStudentToken(token)).valid).toBe(true)
  })
})

describe('6. expired activation link', () => {
  it('is rejected', async () => {
    const token = await requestAndGetToken()
    await prisma.studentAccessToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect(await inspectStudentToken(token)).toEqual({ valid: false, reason: 'expired' })
    await expectAppError(completeStudentToken({ token, password: NEW_PW, confirmPassword: NEW_PW }, null), 'VALIDATION', /expired/)
    expect(await prisma.user.count({ where: { email: 'neha.rao@college.edu' } })).toBe(0)
  })
})

describe('7. invalid activation token', () => {
  it('rejects unknown, malformed and missing tokens', async () => {
    const unknown = 'A'.repeat(43)
    expect(await inspectStudentToken(unknown)).toEqual({ valid: false, reason: 'invalid' })
    expect(await inspectStudentToken('<script>')).toEqual({ valid: false, reason: 'invalid' })
    expect(await inspectStudentToken(undefined)).toEqual({ valid: false, reason: 'invalid' })
    await expectAppError(completeStudentToken({ token: unknown, password: NEW_PW, confirmPassword: NEW_PW }, null), 'VALIDATION', /invalid/)
  })
})

describe('8. reusing an already-used token', () => {
  it('works exactly once, even with simultaneous submissions', async () => {
    const token = await requestAndGetToken()
    const results = await Promise.allSettled([
      completeStudentToken({ token, password: NEW_PW, confirmPassword: NEW_PW }, null),
      completeStudentToken({ token, password: NEW_PW, confirmPassword: NEW_PW }, null),
      completeStudentToken({ token, password: NEW_PW, confirmPassword: NEW_PW }, null),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    await expectAppError(completeStudentToken({ token, password: NEW_PW, confirmPassword: NEW_PW }, null), 'VALIDATION', /already been used/)
    expect(await prisma.user.count({ where: { email: 'neha.rao@college.edu' } })).toBe(1) // no duplicate account
  })
})

describe('9. successful password creation', () => {
  it('activates a STUDENT account linked to the college record', async () => {
    const token = await requestAndGetToken()
    const r = await completeStudentToken({ token, password: NEW_PW, confirmPassword: NEW_PW }, null)
    expect(r.purpose).toBe('ACTIVATION')
    const user = await prisma.user.findUniqueOrThrow({ where: { id: r.userId }, include: { studentProfile: true } })
    expect(user.role).toBe('STUDENT') // assigned server-side
    expect(user.status).toBe('ACTIVE')
    expect(user.name).toBe('Neha Rao')
    expect(user.emailVerifiedAt).not.toBeNull()
    expect(user.passwordHash).not.toContain(NEW_PW)
    expect(user.studentProfile?.externalStudentId).toBe('24CS031')
    expect(user.studentProfile?.enrollmentStatus).toBe('ENROLLED')
    expect(await prisma.auditLog.count({ where: { action: 'student.activated' } })).toBe(1)
  })

  it('rejects weak or mismatched passwords server-side', async () => {
    const token = await requestAndGetToken()
    await expectAppError(completeStudentToken({ token, password: 'short1', confirmPassword: 'short1' }, null), 'VALIDATION')
    await expectAppError(completeStudentToken({ token, password: 'passwordonly', confirmPassword: 'passwordonly' }, null), 'VALIDATION')
    await expectAppError(completeStudentToken({ token, password: NEW_PW, confirmPassword: 'Different1' }, null), 'VALIDATION', /match/)
    expect((await inspectStudentToken(token)).valid).toBe(true) // failed attempts don't burn the link
  })
})

describe('10. login after activation', () => {
  it('signs in at the student portal only', async () => {
    const token = await requestAndGetToken()
    await completeStudentToken({ token, password: NEW_PW, confirmPassword: NEW_PW }, null)
    expect((await authenticate('STUDENT', { email: 'neha.rao@college.edu', password: NEW_PW }, null)).role).toBe('STUDENT')
    await expectAppError(authenticate('STAFF', { email: 'neha.rao@college.edu', password: NEW_PW }, null), 'UNAUTHORIZED')
    await expectAppError(authenticate('CANTEEN', { email: 'neha.rao@college.edu', password: NEW_PW }, null), 'UNAUTHORIZED')
  })
})

describe('password reset (students)', () => {
  it('replaces the password via a single-use link and signs out other sessions', async () => {
    const s = await createStudent({ email: 'karan.mehta@college.edu', studentId: '23ME090' })
    await prisma.session.create({ data: { tokenHash: 'x'.repeat(64), userId: s.user.id, expiresAt: new Date(Date.now() + 60_000) } })
    await requestStudentLink('PASSWORD_RESET', s.user.email, null)
    const [mail] = await mailsTo(s.user.email)
    expect(mail.subject).toBe('Reset your CampusBite password')
    const r = await completeStudentToken({ token: tokenFrom(mail.body), password: NEW_PW, confirmPassword: NEW_PW }, null)
    expect(r.purpose).toBe('PASSWORD_RESET')
    expect(await prisma.session.count({ where: { userId: s.user.id } })).toBe(0)
    await expectAppError(authenticate('STUDENT', { email: s.user.email, password: TEST_PASSWORD }, null), 'UNAUTHORIZED')
    expect((await authenticate('STUDENT', { email: s.user.email, password: NEW_PW }, null)).userId).toBe(s.user.id)
  })

  it('sends nothing for staff or unknown accounts', async () => {
    const staff = await createStaff()
    await requestStudentLink('PASSWORD_RESET', staff.user.email, null)
    await requestStudentLink('PASSWORD_RESET', 'nobody@college.edu', null)
    expect(await prisma.devMailMessage.count()).toBe(0)
  })
})
