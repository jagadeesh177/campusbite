import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/supabase', async () => (await import('../fake-supabase')).fakeSupabaseModule)

const { fake } = await import('../fake-supabase')
const { finishGoogleSignIn, startGoogleSignIn } = await import('@/lib/auth/google')
const { authenticate, changeOwnPassword } = await import('@/lib/auth/login')
const { createAccount, resetAccountPassword } = await import('@/lib/admin')
const { rateLimit } = await import('@/lib/auth/rate-limit')
const { AppError } = await import('@/lib/errors')
const { createCanteen, createStaff, prisma, resetDb } = await import('../helpers')

async function google(email: string) {
  const start = await startGoogleSignIn()
  return finishGoogleSignIn(fake.googleCode(email), start!.state)
}

async function expectAppError(p: Promise<unknown>, code: InstanceType<typeof AppError>['code'], message?: RegExp) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code && (!message || message.test(e.message)))
}

beforeEach(async () => {
  await resetDb()
  fake.reset()
})

describe('customers: Google only, USER account created on first sign-in', () => {
  it('first-time Google user gets a USER account; returning user signs into the same account', async () => {
    const first = await google('New.Person@gmail.com')
    expect(first).toMatchObject({ ok: true, created: true })
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'new.person@gmail.com' } })
    expect(user).toMatchObject({ role: 'USER', status: 'ACTIVE', name: 'Google User', passwordHash: null })
    expect(await google('new.person@gmail.com')).toMatchObject({ ok: true, userId: user.id, created: false })
    expect(await prisma.user.count({ where: { email: 'new.person@gmail.com' } })).toBe(1)
  })

  it('simultaneous first sign-ins never create two accounts', async () => {
    const results = await Promise.all([google('race@gmail.com'), google('race@gmail.com'), google('race@gmail.com')])
    expect(results.every((r) => r.ok)).toBe(true)
    expect(await prisma.user.count({ where: { email: 'race@gmail.com' } })).toBe(1)
  })

  it('deactivated accounts are refused; a code without the matching PKCE state is refused', async () => {
    const r = await google('gone@gmail.com')
    if (r.ok) await prisma.user.update({ where: { id: r.userId }, data: { status: 'DEACTIVATED' } })
    expect(await google('gone@gmail.com')).toMatchObject({ ok: false, reason: 'deactivated' })
    expect(await finishGoogleSignIn(fake.googleCode('x@gmail.com'), JSON.stringify({ storage: {} }))).toMatchObject({ ok: false, reason: 'failed' })
    expect(await finishGoogleSignIn(fake.googleCode('x@gmail.com'), undefined)).toMatchObject({ ok: false, reason: 'failed' })
  })

  it('an account already linked to another Google identity is not taken over', async () => {
    const r = await google('asha.kumar@gmail.com')
    if (!r.ok) throw new Error('setup')
    await prisma.user.update({ where: { id: r.userId }, data: { supabaseUserId: 'someone-else' } })
    expect(await google('asha.kumar@gmail.com')).toMatchObject({ ok: false, reason: 'failed' })
  })

  it('staff and kitchen emails are refused at Google sign-in: nothing linked, created or changed', async () => {
    const staff = await createStaff()
    await prisma.user.update({ where: { id: staff.user.id }, data: { email: 'boss@gmail.com' } })
    const kitchen = await createCanteen()
    await prisma.user.update({ where: { id: kitchen.user.id }, data: { email: 'kitchen@gmail.com' } })
    expect(await google('boss@gmail.com')).toEqual({ ok: false, reason: 'use_password' })
    expect(await google('kitchen@gmail.com')).toEqual({ ok: false, reason: 'use_password' })
    const after = await prisma.user.findUniqueOrThrow({ where: { id: staff.user.id } })
    expect(after).toMatchObject({ role: 'STAFF', supabaseUserId: null })
    expect(fake.users.has('boss@gmail.com')).toBe(false) // stray Supabase login removed
    expect(await prisma.user.count({ where: { email: { in: ['boss@gmail.com', 'kitchen@gmail.com'] } } })).toBe(2)
  })
})

describe('staff and kitchen: email + password, accounts created by an administrator', () => {
  it('admin creates a kitchen account with a temporary password; it must be changed at first sign-in', async () => {
    const admin = await createStaff(['STAFF_ACCOUNTS', 'CANTEEN_ACCOUNTS'])
    const { tempPassword } = await createAccount(admin.actor, { kind: 'CANTEEN', email: 'Counter.Two@college.edu', name: 'Counter Two', permissions: ['ORDERS'] })
    const acct = await prisma.user.findUniqueOrThrow({ where: { email: 'counter.two@college.edu' } })
    expect(acct).toMatchObject({ role: 'CANTEEN', mustChangePassword: true })
    expect(acct.passwordHash).not.toContain(tempPassword)

    const r = await authenticate('CANTEEN', { email: 'counter.two@college.edu', password: tempPassword }, null)
    expect(r).toMatchObject({ userId: acct.id, role: 'CANTEEN', mustChangePassword: true })

    expect(await changeOwnPassword({ userId: acct.id }, { currentPassword: tempPassword, newPassword: 'KitchenPass9', confirmPassword: 'KitchenPass9' })).toEqual({ ok: true })
    expect(await authenticate('CANTEEN', { email: 'counter.two@college.edu', password: 'KitchenPass9' }, null)).toMatchObject({ mustChangePassword: false })
    await expectAppError(authenticate('CANTEEN', { email: 'counter.two@college.edu', password: tempPassword }, null), 'UNAUTHORIZED')
  })

  it('wrong portal, wrong password, unknown email and customers all get the same error', async () => {
    const admin = await createStaff(['STAFF_ACCOUNTS', 'CANTEEN_ACCOUNTS'])
    const { tempPassword } = await createAccount(admin.actor, { kind: 'STAFF', email: 'ops@college.edu', name: 'Ops', permissions: [] })
    await expectAppError(authenticate('CANTEEN', { email: 'ops@college.edu', password: tempPassword }, null), 'UNAUTHORIZED', /Incorrect email or password/)
    await expectAppError(authenticate('STAFF', { email: 'ops@college.edu', password: 'nope-1234' }, null), 'UNAUTHORIZED', /Incorrect email or password/)
    await expectAppError(authenticate('STAFF', { email: 'nobody@college.edu', password: 'x' }, null), 'UNAUTHORIZED', /Incorrect email or password/)
    await google('shopper@gmail.com') // a customer (no password)
    await expectAppError(authenticate('STAFF', { email: 'shopper@gmail.com', password: 'anything1' }, null), 'UNAUTHORIZED')
    expect(await authenticate('STAFF', { email: 'ops@college.edu', password: tempPassword }, null)).toMatchObject({ role: 'STAFF' })
  })

  it('deactivated accounts cannot sign in; admin reset issues a new temporary password and signs them out', async () => {
    const admin = await createStaff(['STAFF_ACCOUNTS', 'CANTEEN_ACCOUNTS'])
    const { userId, tempPassword } = await createAccount(admin.actor, { kind: 'CANTEEN', email: 'k2@college.edu', name: 'K2', permissions: ['ORDERS'] })
    await prisma.session.create({ data: { tokenHash: 'k'.repeat(64), userId, expiresAt: new Date(Date.now() + 60_000) } })
    const reset = await resetAccountPassword(admin.actor, userId)
    expect(reset.tempPassword).not.toBe(tempPassword)
    expect(await prisma.session.count({ where: { userId } })).toBe(0)
    expect(await authenticate('CANTEEN', { email: 'k2@college.edu', password: reset.tempPassword }, null)).toMatchObject({ mustChangePassword: true })
    await prisma.user.update({ where: { id: userId }, data: { status: 'DEACTIVATED' } })
    await expectAppError(authenticate('CANTEEN', { email: 'k2@college.edu', password: reset.tempPassword }, null), 'FORBIDDEN', /deactivated/)
  })

  it('one email = one role: a customer email cannot be made staff', async () => {
    const admin = await createStaff(['STAFF_ACCOUNTS', 'CANTEEN_ACCOUNTS'])
    await google('shopper@gmail.com')
    await expectAppError(createAccount(admin.actor, { kind: 'STAFF', email: 'shopper@gmail.com', name: 'Shopper', permissions: [] }), 'CONFLICT')
  })

  it('change password checks the current one and the rules', async () => {
    const admin = await createStaff(['STAFF_ACCOUNTS', 'CANTEEN_ACCOUNTS'])
    const { userId, tempPassword } = await createAccount(admin.actor, { kind: 'STAFF', email: 'pw@college.edu', name: 'PW', permissions: [] })
    expect(await changeOwnPassword({ userId }, { currentPassword: 'wrong', newPassword: 'GoodPass12', confirmPassword: 'GoodPass12' })).toMatchObject({ ok: false, fieldErrors: { currentPassword: expect.any(Array) } })
    expect(await changeOwnPassword({ userId }, { currentPassword: tempPassword, newPassword: 'short', confirmPassword: 'short' })).toMatchObject({ ok: false })
    expect(await changeOwnPassword({ userId }, { currentPassword: tempPassword, newPassword: 'GoodPass12', confirmPassword: 'Different12' })).toMatchObject({ ok: false })
  })
})

describe('rate limiting', () => {
  it('rate limiter is atomic under concurrency', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit('t:concurrent', 5, 60)))
    expect(results.filter((r) => r.ok)).toHaveLength(5)
  })
})
