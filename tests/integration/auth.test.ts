import { beforeEach, describe, expect, it } from 'vitest'
import { authenticate } from '@/lib/auth/login'
import { rateLimit } from '@/lib/auth/rate-limit'
import { AppError } from '@/lib/errors'
import { createCanteen, createStaff, createUser, resetDb, TEST_PASSWORD } from '../helpers'

beforeEach(resetDb)

async function expectAppError(p: Promise<unknown>, code: AppError['code']) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

describe('login', () => {
  it('signs in each role only at its own portal', async () => {
    const s = await createUser()
    const st = await createStaff()
    const c = await createCanteen()
    expect((await authenticate('USER', { email: s.user.email, password: TEST_PASSWORD }, null)).role).toBe('USER')
    expect((await authenticate('STAFF', { email: st.user.email, password: TEST_PASSWORD }, null)).role).toBe('STAFF')
    expect((await authenticate('CANTEEN', { email: c.user.email, password: TEST_PASSWORD }, null)).role).toBe('CANTEEN')
    // A user can't escalate by using the staff login page
    await expectAppError(authenticate('STAFF', { email: s.user.email, password: TEST_PASSWORD }, null), 'UNAUTHORIZED')
    await expectAppError(authenticate('USER', { email: st.user.email, password: TEST_PASSWORD }, null), 'UNAUTHORIZED')
  })

  it('rejects wrong passwords, unknown users and deactivated accounts', async () => {
    const s = await createUser()
    const gone = await createUser({ status: 'DEACTIVATED' })
    await expectAppError(authenticate('USER', { email: s.user.email, password: 'wrong-pass1' }, null), 'UNAUTHORIZED')
    await expectAppError(authenticate('USER', { email: 'nobody@college.edu', password: TEST_PASSWORD }, null), 'UNAUTHORIZED')
    await expectAppError(authenticate('USER', { email: gone.user.email, password: TEST_PASSWORD }, null), 'FORBIDDEN')
  })

  it('rate-limits repeated failures', async () => {
    const s = await createUser()
    for (let i = 0; i < 5; i++) {
      await expectAppError(authenticate('USER', { email: s.user.email, password: 'wrong-pass1' }, '1.2.3.4'), 'UNAUTHORIZED')
    }
    await expectAppError(authenticate('USER', { email: s.user.email, password: TEST_PASSWORD }, '1.2.3.4'), 'RATE_LIMITED')
  })

  it('rate limiter is atomic under concurrency', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit('t:concurrent', 5, 60)))
    expect(results.filter((r) => r.ok)).toHaveLength(5)
  })
})
