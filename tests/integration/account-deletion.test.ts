import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/supabase', async () => (await import('../fake-supabase')).fakeSupabaseModule)

const { fake } = await import('../fake-supabase')
const { completeUserLink, registerUser } = await import('@/lib/auth/user-auth')
const { deleteOwnAccount, isDeletedAccountEmail } = await import('@/lib/account-deletion')
const { setUserAccess } = await import('@/lib/admin')
const { authenticate } = await import('@/lib/auth/login')
const { createOrder } = await import('@/lib/orders/create-order')
const { AppError } = await import('@/lib/errors')
const { createMenu, createStaff, createUser, prisma, resetDb, setupKitchen, TEST_PASSWORD, uuid } = await import('../helpers')

const PW = 'Campus2026!'

async function expectAppError(p: Promise<unknown>, code: InstanceType<typeof AppError>['code'], message?: RegExp) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof AppError && e.code === code && (!message || message.test(e.message)),
  )
}

/** A fully registered Supabase user */
async function registered(email = 'asha@gmail.com') {
  await registerUser({ email, fullName: 'Asha Kumar', phone: '9876543210' }, null)
  const { userId } = await completeUserLink({ tokenHash: fake.lastTo(email)!.tokenHash, type: 'email', password: PW, confirmPassword: PW }, null)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  return { user, actor: { userId, role: 'USER' as const, name: user.name, permissions: [] } }
}

beforeEach(async () => {
  await resetDb()
  fake.reset()
})

describe('delete account', () => {
  it('needs the password and the word DELETE', async () => {
    const { actor } = await registered()
    await expectAppError(deleteOwnAccount(actor, { password: PW, confirm: 'delete me' }), 'VALIDATION', /Type DELETE/)
    await expectAppError(deleteOwnAccount(actor, { password: 'Wrong1234', confirm: 'DELETE' }), 'UNAUTHORIZED', /Incorrect password/)
    expect(await prisma.user.count()).toBe(1)
  })

  it('without orders: removes the account and the Supabase login completely', async () => {
    const { user, actor } = await registered()
    await prisma.session.create({ data: { tokenHash: 'z'.repeat(64), userId: user.id, expiresAt: new Date(Date.now() + 60_000) } })
    const r = await deleteOwnAccount(actor, { password: PW, confirm: 'DELETE' })
    expect(r).toEqual({ anonymised: false })
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull()
    expect(await prisma.userProfile.count()).toBe(0)
    expect(await prisma.session.count()).toBe(0)
    expect(fake.users.has('asha@gmail.com')).toBe(false) // Supabase login gone
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.account_deleted' } })
    expect(JSON.stringify(log.metadata)).not.toContain('asha')
    // can't sign in any more
    await expectAppError(authenticate('USER', { email: 'asha@gmail.com', password: PW }, null), 'UNAUTHORIZED')
  })

  it('with past orders: erases personal data but keeps anonymous order records; unpaid orders are cancelled', async () => {
    await setupKitchen()
    const menu = await createMenu()
    const { user, actor } = await registered()
    const co = await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })

    expect(await deleteOwnAccount(actor, { password: PW, confirm: 'DELETE' })).toEqual({ anonymised: true })
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after).toMatchObject({ name: 'Deleted user', status: 'DEACTIVATED', passwordHash: null, supabaseUserId: null })
    expect(isDeletedAccountEmail(after.email)).toBe(true)
    expect(after.email).not.toContain('asha')
    expect(await prisma.userProfile.count({ where: { userId: user.id } })).toBe(0)
    const order = await prisma.order.findUniqueOrThrow({ where: { id: co.orderId } })
    expect(order.status).toBe('CANCELLED') // was unpaid
    // the email can be used to register again
    await registerUser({ email: 'asha@gmail.com', fullName: 'Asha Again', phone: '9876543210' }, null)
    expect(fake.lastTo('asha@gmail.com')).toBeTruthy()
  })

  it('is blocked while an order is in progress', async () => {
    await setupKitchen()
    const menu = await createMenu()
    const { actor } = await registered()
    const co = await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    await prisma.order.update({ where: { id: co.orderId }, data: { status: 'PREPARING' } })
    await expectAppError(deleteOwnAccount(actor, { password: PW, confirm: 'DELETE' }), 'CONFLICT', /still in progress/)
    expect(fake.users.has('asha@gmail.com')).toBe(true) // nothing deleted
  })

  it('works for older demo accounts with a local password', async () => {
    const u = await createUser({ email: 'demo.user@gmail.com' })
    await deleteOwnAccount(u.actor, { password: TEST_PASSWORD, confirm: 'DELETE' })
    expect(await prisma.user.findUnique({ where: { id: u.user.id } })).toBeNull()
  })

  it('staff and canteen cannot use it, and staff cannot restore a deleted account', async () => {
    const staff = await createStaff()
    await expectAppError(deleteOwnAccount(staff.actor, { password: TEST_PASSWORD, confirm: 'DELETE' }), 'FORBIDDEN')

    await setupKitchen()
    const menu = await createMenu()
    const { user, actor } = await registered()
    await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    await deleteOwnAccount(actor, { password: PW, confirm: 'DELETE' })
    await expectAppError(setUserAccess(staff.actor, user.id, true), 'CONFLICT', /deleted by its owner/)
  })
})
