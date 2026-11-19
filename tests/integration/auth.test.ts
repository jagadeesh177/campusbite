import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/supabase', async () => (await import('../fake-supabase')).fakeSupabaseModule)

const { fake } = await import('../fake-supabase')
const { finishGoogleSignIn, startGoogleSignIn, NOT_AUTHORIZED, parsePortal } = await import('@/lib/auth/google')
const { createAccount } = await import('@/lib/admin')
const { rateLimit } = await import('@/lib/auth/rate-limit')
const { AppError } = await import('@/lib/errors')
const { createCanteen, createStaff, prisma, resetDb } = await import('../helpers')

type Portal = 'USER' | 'STAFF' | 'CANTEEN'
async function google(email: string, portal: Portal = 'USER') {
  const start = await startGoogleSignIn(portal)
  return finishGoogleSignIn(fake.googleCode(email), start!.state)
}

beforeEach(async () => {
  await resetDb()
  fake.reset()
})

describe('main portal: Google only, USER account created on first sign-in', () => {
  it('first-time Google user gets a USER account; returning user signs into the same account', async () => {
    const first = await google('New.Person@gmail.com')
    expect(first).toMatchObject({ ok: true, role: 'USER', created: true })
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

  it('an existing account keeps its role (staff at the main portal stays STAFF, never USER)', async () => {
    const staff = await createStaff()
    await prisma.user.update({ where: { id: staff.user.id }, data: { email: 'boss@gmail.com' } })
    expect(await google('boss@gmail.com')).toMatchObject({ ok: true, role: 'STAFF', userId: staff.user.id })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: staff.user.id } })).role).toBe('STAFF')
  })

  it('deactivated accounts are refused; a code without the matching PKCE state is refused', async () => {
    const r = await google('gone@gmail.com')
    if (r.ok) await prisma.user.update({ where: { id: r.userId }, data: { status: 'DEACTIVATED' } })
    expect(await google('gone@gmail.com')).toMatchObject({ ok: false, reason: 'deactivated' })
    expect(await finishGoogleSignIn(fake.googleCode('x@gmail.com'), JSON.stringify({ portal: 'USER', storage: {} }))).toMatchObject({ ok: false, reason: 'failed' })
    expect(await finishGoogleSignIn(fake.googleCode('x@gmail.com'), undefined)).toMatchObject({ ok: false, reason: 'failed' })
  })

  it('an account already linked to another Google identity is not taken over', async () => {
    const r = await google('asha.kumar@gmail.com')
    if (!r.ok) throw new Error('setup')
    await prisma.user.update({ where: { id: r.userId }, data: { supabaseUserId: 'someone-else' } })
    expect(await google('asha.kumar@gmail.com')).toMatchObject({ ok: false, reason: 'failed' })
  })
})

describe('staff portal: existing authorised STAFF only', () => {
  it('existing STAFF signs in with Google (linked by email, role kept)', async () => {
    const staff = await createStaff()
    await prisma.user.update({ where: { id: staff.user.id }, data: { email: 'admin.real@gmail.com' } })
    expect(await google('admin.real@gmail.com', 'STAFF')).toMatchObject({ ok: true, role: 'STAFF', userId: staff.user.id, created: false })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: staff.user.id } })).supabaseUserId).toBeTruthy()
  })

  it('unknown Google users, USERs and CANTEEN accounts are not authorised; nothing is created', async () => {
    expect(await google('stranger@gmail.com', 'STAFF')).toEqual({ ok: false, reason: 'not_authorized', portal: 'STAFF' })
    expect(await prisma.user.count({ where: { email: 'stranger@gmail.com' } })).toBe(0)
    expect(fake.users.has('stranger@gmail.com')).toBe(false) // stray Supabase login removed
    await google('customer@gmail.com') // a USER
    expect(await google('customer@gmail.com', 'STAFF')).toMatchObject({ ok: false, reason: 'not_authorized' })
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'customer@gmail.com' } })).role).toBe('USER') // never promoted
    expect(NOT_AUTHORIZED.STAFF).toBe('You are not authorized to access the Staff Portal.')
  })

  it('a deactivated staff account is refused', async () => {
    const staff = await createStaff()
    await prisma.user.update({ where: { id: staff.user.id }, data: { email: 'old.staff@gmail.com', status: 'DEACTIVATED' } })
    expect(await google('old.staff@gmail.com', 'STAFF')).toMatchObject({ ok: false, reason: 'deactivated' })
  })
})

describe('kitchen portal: existing authorised CANTEEN only', () => {
  it('existing CANTEEN signs in; others are not authorised', async () => {
    const kitchen = await createCanteen()
    await prisma.user.update({ where: { id: kitchen.user.id }, data: { email: 'kitchen.real@gmail.com' } })
    expect(await google('kitchen.real@gmail.com', 'CANTEEN')).toMatchObject({ ok: true, role: 'CANTEEN' })
    expect(await google('stranger@gmail.com', 'CANTEEN')).toEqual({ ok: false, reason: 'not_authorized', portal: 'CANTEEN' })
    const staff = await createStaff()
    await prisma.user.update({ where: { id: staff.user.id }, data: { email: 'boss@gmail.com' } })
    expect(await google('boss@gmail.com', 'CANTEEN')).toMatchObject({ ok: false, reason: 'not_authorized' })
    expect(NOT_AUTHORIZED.CANTEEN).toBe('You are not authorized to access the Kitchen Portal.')
  })

  it('portal names from the URL are normalised; anything unknown is the main portal', () => {
    expect(parsePortal('staff')).toBe('STAFF')
    expect(parsePortal('kitchen')).toBe('CANTEEN')
    expect(parsePortal('canteen')).toBe('CANTEEN')
    expect(parsePortal('ADMIN')).toBe('USER')
    expect(parsePortal(null)).toBe('USER')
  })
})

describe('staff-managed accounts', () => {
  it('administrators add staff/kitchen accounts by Google email (no password); one email = one role', async () => {
    const admin = await createStaff(['STAFF_ACCOUNTS', 'CANTEEN_ACCOUNTS'])
    await createAccount(admin.actor, { kind: 'CANTEEN', email: 'Counter.Two@gmail.com', name: 'Counter Two', permissions: ['ORDERS'] })
    const acct = await prisma.user.findUniqueOrThrow({ where: { email: 'counter.two@gmail.com' } })
    expect(acct).toMatchObject({ role: 'CANTEEN', passwordHash: null, mustChangePassword: false })
    expect(await google('counter.two@gmail.com', 'CANTEEN')).toMatchObject({ ok: true, userId: acct.id })
    await google('shopper@gmail.com')
    await expect(createAccount(admin.actor, { kind: 'STAFF', email: 'shopper@gmail.com', name: 'Shopper', permissions: [] })).rejects.toBeInstanceOf(AppError)
  })
})

describe('rate limiting', () => {
  it('rate limiter is atomic under concurrency', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit('t:concurrent', 5, 60)))
    expect(results.filter((r) => r.ok)).toHaveLength(5)
  })
})
