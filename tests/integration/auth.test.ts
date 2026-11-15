import { beforeEach, describe, expect, it } from 'vitest'
import { authenticate } from '@/lib/auth/login'
import { completeStudentActivation, startStudentActivation } from '@/lib/auth/activation'
import { rateLimit } from '@/lib/auth/rate-limit'
import { AppError } from '@/lib/errors'
import { createCanteen, createStaff, createStudent, prisma, resetDb, TEST_PASSWORD } from '../helpers'

beforeEach(resetDb)

async function expectAppError(p: Promise<unknown>, code: AppError['code']) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

async function latestCode(email: string) {
  const mail = await prisma.devMailMessage.findFirstOrThrow({ where: { to: email }, orderBy: { createdAt: 'desc' } })
  return /(\d{6})/.exec(mail.body)![1]
}

describe('login', () => {
  it('signs in each role only at its own portal', async () => {
    const s = await createStudent()
    const st = await createStaff()
    const c = await createCanteen()
    expect((await authenticate('STUDENT', { email: s.user.email, password: TEST_PASSWORD }, null)).role).toBe('STUDENT')
    expect((await authenticate('STAFF', { email: st.user.email, password: TEST_PASSWORD }, null)).role).toBe('STAFF')
    expect((await authenticate('CANTEEN', { email: c.user.email, password: TEST_PASSWORD }, null)).role).toBe('CANTEEN')
    // A student can't escalate by using the staff login page
    await expectAppError(authenticate('STAFF', { email: s.user.email, password: TEST_PASSWORD }, null), 'UNAUTHORIZED')
    await expectAppError(authenticate('STUDENT', { email: st.user.email, password: TEST_PASSWORD }, null), 'UNAUTHORIZED')
  })

  it('rejects wrong passwords, unknown users and deactivated accounts', async () => {
    const s = await createStudent()
    const gone = await createStudent({ status: 'DEACTIVATED' })
    await expectAppError(authenticate('STUDENT', { email: s.user.email, password: 'wrong-pass1' }, null), 'UNAUTHORIZED')
    await expectAppError(authenticate('STUDENT', { email: 'nobody@college.edu', password: TEST_PASSWORD }, null), 'UNAUTHORIZED')
    await expectAppError(authenticate('STUDENT', { email: gone.user.email, password: TEST_PASSWORD }, null), 'FORBIDDEN')
  })

  it('blocks a student whose enrollment ended (re-checked with the college)', async () => {
    const s = await createStudent({ studentId: '20CS050', email: 'old.graduate@college.edu' })
    await prisma.studentProfile.update({ where: { userId: s.user.id }, data: { enrollmentCheckedAt: new Date(0) } })
    await expectAppError(authenticate('STUDENT', { email: s.user.email, password: TEST_PASSWORD }, null), 'FORBIDDEN')
  })

  it('rate-limits repeated failures', async () => {
    const s = await createStudent()
    for (let i = 0; i < 5; i++) {
      await expectAppError(authenticate('STUDENT', { email: s.user.email, password: 'wrong-pass1' }, '1.2.3.4'), 'UNAUTHORIZED')
    }
    await expectAppError(authenticate('STUDENT', { email: s.user.email, password: TEST_PASSWORD }, '1.2.3.4'), 'RATE_LIMITED')
  })

  it('rate limiter is atomic under concurrency', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit('t:concurrent', 5, 60)))
    expect(results.filter((r) => r.ok)).toHaveLength(5)
  })
})

describe('student activation', () => {
  it('activates an enrolled student via emailed code', async () => {
    await startStudentActivation('neha.rao@college.edu', null)
    const code = await latestCode('neha.rao@college.edu')
    const { userId } = await completeStudentActivation({
      email: 'neha.rao@college.edu',
      code,
      password: 'MyPassw0rd',
      confirmPassword: 'MyPassw0rd',
    })
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { studentProfile: true } })
    expect(user.status).toBe('ACTIVE')
    expect(user.role).toBe('STUDENT')
    expect(user.studentProfile?.externalStudentId).toBe('24CS031')
    expect((await authenticate('STUDENT', { email: 'neha.rao@college.edu', password: 'MyPassw0rd' }, null)).userId).toBe(userId)
  })

  it('never lets a personal email register as a student', async () => {
    await expectAppError(startStudentActivation('someone@gmail.com', null), 'VALIDATION')
    expect(await prisma.devMailMessage.count()).toBe(0)
  })

  it('sends nothing to non-enrolled or unknown college emails (no enumeration)', async () => {
    await startStudentActivation('old.graduate@college.edu', null)
    await startStudentActivation('not.a.student@college.edu', null)
    expect(await prisma.devMailMessage.count()).toBe(0)
  })

  it('locks a code after too many wrong guesses and never stores it in plain text', async () => {
    await startStudentActivation('karan.mehta@college.edu', null)
    const code = await latestCode('karan.mehta@college.edu')
    const stored = await prisma.verificationCode.findFirstOrThrow()
    expect(stored.codeHash).not.toContain(code)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) {
      await expectAppError(
        completeStudentActivation({ email: 'karan.mehta@college.edu', code: wrong, password: 'MyPassw0rd', confirmPassword: 'MyPassw0rd' }),
        'VALIDATION',
      )
    }
    await expectAppError(
      completeStudentActivation({ email: 'karan.mehta@college.edu', code, password: 'MyPassw0rd', confirmPassword: 'MyPassw0rd' }),
      'RATE_LIMITED',
    )
  })

  it('rejects weak passwords', async () => {
    await startStudentActivation('neha.rao@college.edu', null)
    const code = await latestCode('neha.rao@college.edu')
    await expectAppError(
      completeStudentActivation({ email: 'neha.rao@college.edu', code, password: 'password', confirmPassword: 'password' }),
      'VALIDATION',
    )
  })
})
