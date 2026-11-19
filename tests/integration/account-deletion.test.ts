import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/supabase', async () => (await import('../fake-supabase')).fakeSupabaseModule)

const { fake } = await import('../fake-supabase')
const { deleteOwnAccount, isDeletedAccountEmail } = await import('@/lib/account-deletion')
const { setUserAccess } = await import('@/lib/admin')
const { finishGoogleSignIn, startGoogleSignIn } = await import('@/lib/auth/google')
const { createOrder } = await import('@/lib/orders/create-order')
const { AppError } = await import('@/lib/errors')
const { createMenu, createStaff, prisma, resetDb, setupKitchen, uuid } = await import('../helpers')

async function expectAppError(p: Promise<unknown>, code: InstanceType<typeof AppError>['code'], message?: RegExp) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code && (!message || message.test(e.message)))
}

async function google(email: string) {
  const start = await startGoogleSignIn()
  return finishGoogleSignIn(fake.googleCode(email), start!.state)
}

/** A user who signed up with Google */
async function registered(email = 'asha.kumar@gmail.com') {
  const r = await google(email)
  if (!r.ok) throw new Error('google sign-in failed')
  const user = await prisma.user.findUniqueOrThrow({ where: { id: r.userId } })
  return { user, actor: { userId: user.id, role: 'USER' as const, name: user.name, permissions: [] } }
}

beforeEach(async () => {
  await resetDb()
  fake.reset()
})

describe('delete account', () => {
  it('needs the word DELETE', async () => {
    const { actor } = await registered()
    await expectAppError(deleteOwnAccount(actor, { confirm: 'delete me' }), 'VALIDATION', /Type DELETE/)
    expect(await prisma.user.count({ where: { role: 'USER' } })).toBe(1)
  })

  it('without orders: removes the account; Google sign-in later starts a new, empty account', async () => {
    const { user, actor } = await registered()
    await prisma.session.create({ data: { tokenHash: 'z'.repeat(64), userId: user.id, expiresAt: new Date(Date.now() + 60_000) } })
    expect(await deleteOwnAccount(actor, { confirm: 'DELETE' })).toEqual({ anonymised: false })
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull()
    expect(await prisma.userProfile.count()).toBe(0)
    expect(await prisma.session.count()).toBe(0)
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.account_deleted' } })
    expect(JSON.stringify(log.metadata)).not.toContain('asha')
    const again = await google('asha.kumar@gmail.com')
    expect(again).toMatchObject({ ok: true, created: true })
    if (again.ok) expect(again.userId).not.toBe(user.id)
  })

  it('with past orders: erases personal data but keeps anonymous order records; unpaid orders are cancelled', async () => {
    await setupKitchen()
    const menu = await createMenu()
    const { user, actor } = await registered()
    const co = await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    expect(await deleteOwnAccount(actor, { confirm: 'DELETE' })).toEqual({ anonymised: true })
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after).toMatchObject({ name: 'Deleted user', status: 'DEACTIVATED', supabaseUserId: null })
    expect(isDeletedAccountEmail(after.email)).toBe(true)
    expect(await prisma.userProfile.count({ where: { userId: user.id } })).toBe(0)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: co.orderId } })).status).toBe('CANCELLED')
  })

  it('is blocked while an order is in progress', async () => {
    await setupKitchen()
    const menu = await createMenu()
    const { actor, user } = await registered()
    const co = await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    await prisma.order.update({ where: { id: co.orderId }, data: { status: 'PREPARING' } })
    await expectAppError(deleteOwnAccount(actor, { confirm: 'DELETE' }), 'CONFLICT', /still in progress/)
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull()
  })

  it('staff and canteen cannot use it, and staff cannot restore a deleted account', async () => {
    const staff = await createStaff()
    await expectAppError(deleteOwnAccount(staff.actor, { confirm: 'DELETE' }), 'FORBIDDEN')
    await setupKitchen()
    const menu = await createMenu()
    const { user, actor } = await registered()
    await createOrder(actor, { items: [{ foodItemId: menu.samosa.id, quantity: 1 }], idempotencyKey: uuid() })
    await deleteOwnAccount(actor, { confirm: 'DELETE' })
    await expectAppError(setUserAccess(staff.actor, user.id, true), 'CONFLICT', /deleted by its owner/)
  })
})
