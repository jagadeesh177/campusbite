import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/supabase', async () => (await import('../fake-supabase')).fakeSupabaseModule)

const { fake } = await import('../fake-supabase')
const { completeUserLink, registerUser } = await import('@/lib/auth/user-auth')
const { changeOwnPassword } = await import('@/lib/auth/change-password')
const { authenticate } = await import('@/lib/auth/login')
const { AppError } = await import('@/lib/errors')
const { createUser, prisma, resetDb, TEST_PASSWORD } = await import('../helpers')

const PW = 'Campus2026!'
const NEW = 'Brand2026New'

async function expectAppError(p: Promise<unknown>, code: InstanceType<typeof AppError>['code']) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code)
}

async function registered(email = 'asha@gmail.com') {
  await registerUser({ email, fullName: 'Asha Kumar', phone: '9876543210', department: 'CSE' }, null)
  const { userId } = await completeUserLink({ tokenHash: fake.lastTo(email)!.tokenHash, type: 'email', password: PW, confirmPassword: PW }, null)
  return userId
}
const change = (userId: string, currentPassword: string, newPassword: string, confirmPassword = newPassword) =>
  changeOwnPassword({ userId }, { currentPassword, newPassword, confirmPassword })

beforeEach(async () => {
  await resetDb()
  fake.reset()
})

describe('Profile → Account Security (change password)', () => {
  it('correct current password: changes it; new works, old does not; profile untouched', async () => {
    const userId = await registered()
    const before = await prisma.userProfile.findUniqueOrThrow({ where: { userId } })
    expect(await change(userId, PW, NEW)).toEqual({ ok: true })
    expect((await authenticate('USER', { email: 'asha@gmail.com', password: NEW }, null)).userId).toBe(userId)
    await expectAppError(authenticate('USER', { email: 'asha@gmail.com', password: PW }, null), 'UNAUTHORIZED')
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(user.passwordHash).toBeNull() // never stored in CampusBite's database
    expect(user.name).toBe('Asha Kumar')
    expect(await prisma.userProfile.findUniqueOrThrow({ where: { userId } })).toMatchObject({ phone: before.phone, department: 'CSE' })
  })

  it('incorrect current password: clear error, nothing changes', async () => {
    const userId = await registered()
    expect(await change(userId, 'Wrong1234', NEW)).toEqual({ ok: false, fieldErrors: { currentPassword: ['Current password is incorrect'] } })
    expect((await authenticate('USER', { email: 'asha@gmail.com', password: PW }, null)).userId).toBe(userId)
  })

  it('mismatch, weak, empty and unchanged passwords are rejected', async () => {
    const userId = await registered()
    expect(await change(userId, PW, NEW, 'Different1')).toMatchObject({ ok: false, fieldErrors: { confirmPassword: ['Passwords do not match'] } })
    expect(await change(userId, PW, 'short1')).toMatchObject({ ok: false, fieldErrors: { newPassword: expect.any(Array) } })
    expect(await change(userId, PW, 'lettersonly')).toMatchObject({ ok: false, fieldErrors: { newPassword: expect.any(Array) } })
    expect(await change(userId, '', NEW)).toMatchObject({ ok: false, fieldErrors: { currentPassword: expect.any(Array) } })
    expect(await change(userId, PW, PW)).toMatchObject({ ok: false, fieldErrors: { newPassword: ['Choose a different password'] } })
  })

  it('signs out other devices but keeps the current session', async () => {
    const userId = await registered()
    const keep = await prisma.session.create({ data: { tokenHash: 'a'.repeat(64), userId, expiresAt: new Date(Date.now() + 60_000) } })
    await prisma.session.create({ data: { tokenHash: 'b'.repeat(64), userId, expiresAt: new Date(Date.now() + 60_000) } })
    await changeOwnPassword({ userId, sessionId: keep.id }, { currentPassword: PW, newPassword: NEW, confirmPassword: NEW })
    expect((await prisma.session.findMany({ where: { userId } })).map((s) => s.id)).toEqual([keep.id])
  })

  it('older demo accounts (no Supabase login) also work', async () => {
    const u = await createUser({ email: 'demo.user@gmail.com' })
    expect(await change(u.user.id, TEST_PASSWORD, NEW)).toEqual({ ok: true })
    expect((await authenticate('USER', { email: 'demo.user@gmail.com', password: NEW }, null)).userId).toBe(u.user.id)
  })

  it('an expired / deactivated account cannot change its password', async () => {
    const u = await createUser({ email: 'gone@gmail.com', status: 'DEACTIVATED' })
    expect(await change(u.user.id, TEST_PASSWORD, NEW)).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) })
  })
})
