import { beforeEach, describe, expect, it } from 'vitest'
import { authenticate } from '@/lib/auth/login'
import { rateLimit } from '@/lib/auth/rate-limit'
import { AppError } from '@/lib/errors'
import { createCanteen, createStaff, createStudent, resetDb, TEST_PASSWORD } from '../helpers'

beforeEach(resetDb)

async function expectAppError(p: Promise<unknown>, code: AppError['code']) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
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
