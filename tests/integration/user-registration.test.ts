import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/supabase', async () => (await import('../fake-supabase')).fakeSupabaseModule)

const { fake } = await import('../fake-supabase')
const { completeUserLink, registerUser, requestUserPasswordReset } = await import('@/lib/auth/user-auth')
const { authenticate } = await import('@/lib/auth/login')
const { AppError } = await import('@/lib/errors')
const { createStaff, createUser, prisma, resetDb, TEST_PASSWORD } = await import('../helpers')

const PW = 'Campus2026!'
const reg = (email: string, extra: Partial<{ fullName: string; phone: string; department: string }> = {}) =>
  registerUser({ email, fullName: 'Asha Kumar', phone: '98765 43210', department: 'CSE', ...extra }, null)
const complete = (tokenHash: string, type = 'email', password = PW, confirmPassword = password) =>
  completeUserLink({ tokenHash, type, password, confirmPassword }, null)

async function expectAppError(p: Promise<unknown>, code: InstanceType<typeof AppError>['code'], message?: RegExp) {
  await expect(p).rejects.toSatisfy(
    (e: unknown) => e instanceof AppError && e.code === code && (!message || message.test(e.message)),
  )
}

beforeEach(async () => {
  await resetDb()
  fake.reset()
})

describe('registration with any personal email', () => {
  it.each(['asha.k@gmail.com', 'Asha.K@Outlook.com', 'asha_k@yahoo.co.in', 'asha@proton.me'])(
    'sends a real activation email for %s and keeps the account pending',
    async (email) => {
      await reg(email)
      const address = email.toLowerCase()
      const mail = fake.lastTo(address)
      expect(mail?.kind).toBe('email')
      expect(mail?.redirectTo).toMatch(/\/auth\/confirm$/)
      const user = await prisma.user.findUniqueOrThrow({ where: { email: address }, include: { userProfile: true } })
      expect(user.role).toBe('USER') // set by the server
      expect(user.status).toBe('PENDING_VERIFICATION') // NOT active before verification
      expect(user.passwordHash).toBeNull()
      expect(user.userProfile).toMatchObject({ phone: '9876543210', department: 'CSE', integrationSource: 'supabase', externalStudentId: null })
      // can't sign in yet
      await expectAppError(authenticate('USER', { email: address, password: PW }, null), 'UNAUTHORIZED')
    },
  )

  it('rejects invalid email addresses and missing details without sending anything', async () => {
    await expectAppError(reg('not-an-email'), 'VALIDATION', /valid email/)
    await expectAppError(reg('a@b'), 'VALIDATION')
    await expectAppError(reg('ok@gmail.com', { phone: '12345' }), 'VALIDATION', /mobile/)
    await expectAppError(reg('ok@gmail.com', { fullName: ' ' }), 'VALIDATION', /name/)
    expect(fake.sent).toHaveLength(0)
    expect(await prisma.user.count()).toBe(0)
  })

  it('handles duplicate emails without revealing them', async () => {
    const active = await createUser({ email: 'taken@gmail.com' })
    const staff = await createStaff()
    await expect(reg('taken@gmail.com')).resolves.toBeUndefined()
    await expect(reg(staff.user.email)).resolves.toBeUndefined()
    expect(fake.sent).toHaveLength(0)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: staff.user.id } })).role).toBe('STAFF') // untouched
    expect((await prisma.user.findUniqueOrThrow({ where: { id: active.user.id } })).name).toBe(active.user.name)
  })

  it('reports a failed email delivery and lets the user retry straight away', async () => {
    fake.failNextSend = true
    await expectAppError(reg('retry@gmail.com'), 'UNAVAILABLE', /couldn’t send/)
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'retry@gmail.com' } })).status).toBe('PENDING_VERIFICATION')
    await reg('retry@gmail.com') // no cooldown after a failure
    expect(fake.sent).toHaveLength(1)
  })

  it('refuses when Supabase is not configured (no mock delivery)', async () => {
    fake.configured = false
    await expectAppError(reg('x@gmail.com'), 'UNAVAILABLE')
    expect(fake.sent).toHaveLength(0)
  })
})

describe('resend activation email (rate limited)', () => {
  it('sends one email per 15 minutes, then allows a resend', async () => {
    await reg('asha@gmail.com')
    await expectAppError(reg('asha@gmail.com'), 'RATE_LIMITED', /already sent an email/)
    expect(fake.sent).toHaveLength(1)
    // 15 minutes later
    await prisma.rateLimitBucket.updateMany({ data: { windowStart: new Date(Date.now() - 16 * 60_000) } })
    await reg('asha@gmail.com', { fullName: 'Asha K' })
    expect(fake.sent).toHaveLength(2)
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'asha@gmail.com' } })).name).toBe('Asha K')
  })

  it('limits requests per network', async () => {
    for (let i = 0; i < 10; i++) await registerUser({ email: `s${i}@gmail.com`, fullName: 'Sam', phone: '9876543210' }, '9.9.9.9')
    await expectAppError(registerUser({ email: 's10@gmail.com', fullName: 'Sam', phone: '9876543210' }, '9.9.9.9'), 'RATE_LIMITED')
  })
})

describe('activation link → password → dashboard', () => {
  it('activates the account with the USER role and allows login through Supabase', async () => {
    await reg('asha@gmail.com')
    const r = await complete(fake.lastTo('asha@gmail.com')!.tokenHash)
    expect(r.purpose).toBe('ACTIVATION')
    const user = await prisma.user.findUniqueOrThrow({ where: { id: r.userId } })
    expect(user).toMatchObject({ role: 'USER', status: 'ACTIVE', passwordHash: null })
    expect(user.supabaseUserId).toMatch(/^sb-/)
    expect(user.emailVerifiedAt).not.toBeNull()
    expect(await prisma.auditLog.count({ where: { action: 'user.activated' } })).toBe(1)

    expect((await authenticate('USER', { email: 'asha@gmail.com', password: PW }, null)).userId).toBe(user.id)
    await expectAppError(authenticate('USER', { email: 'asha@gmail.com', password: 'Wrong123x' }, null), 'UNAUTHORIZED')
    // role can't be escalated through other portals
    await expectAppError(authenticate('STAFF', { email: 'asha@gmail.com', password: PW }, null), 'UNAUTHORIZED')
    await expectAppError(authenticate('CANTEEN', { email: 'asha@gmail.com', password: PW }, null), 'UNAUTHORIZED')
  })

  it('links work once — reuse and simultaneous submissions are refused', async () => {
    await reg('asha@gmail.com')
    const token = fake.lastTo('asha@gmail.com')!.tokenHash
    const results = await Promise.allSettled([complete(token), complete(token), complete(token)])
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    await expectAppError(complete(token), 'VALIDATION', /expired or has already been used/)
    expect(await prisma.user.count({ where: { email: 'asha@gmail.com' } })).toBe(1)
  })

  it('also works with Supabase default email links (session in the URL fragment), once', async () => {
    await reg('asha@gmail.com')
    const sess = fake.clickDefaultLink(fake.lastTo('asha@gmail.com')!.tokenHash)!
    const input = { accessToken: sess.accessToken, refreshToken: sess.refreshToken, type: sess.type, password: PW, confirmPassword: PW }
    const r = await completeUserLink(input, null)
    expect(r.purpose).toBe('ACTIVATION')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: r.userId } })).status).toBe('ACTIVE')
    await expectAppError(completeUserLink(input, null), 'VALIDATION', /already been used/) // session revoked
    await expectAppError(completeUserLink({ ...input, accessToken: 'x'.repeat(40) }, null), 'VALIDATION')
  })

  it('expired and invalid links are refused and the account stays pending', async () => {
    await reg('asha@gmail.com')
    const token = fake.lastTo('asha@gmail.com')!.tokenHash
    fake.tokens.get(token)!.expiresAt = Date.now() - 1
    await expectAppError(complete(token), 'VALIDATION', /expired/)
    await expectAppError(complete('A'.repeat(40)), 'VALIDATION', /expired or has already been used/)
    await expectAppError(complete('<script>'), 'VALIDATION', /invalid/)
    await expectAppError(complete(token, 'admin'), 'VALIDATION', /invalid/)
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'asha@gmail.com' } })).status).toBe('PENDING_VERIFICATION')
  })

  it('weak or mismatched passwords are rejected before the link is used up', async () => {
    await reg('asha@gmail.com')
    const token = fake.lastTo('asha@gmail.com')!.tokenHash
    await expectAppError(complete(token, 'email', 'short1'), 'VALIDATION')
    await expectAppError(complete(token, 'email', 'lettersonly'), 'VALIDATION')
    await expectAppError(complete(token, 'email', PW, 'Different1'), 'VALIDATION', /match/)
    expect(fake.tokens.get(token)!.used).toBe(false)
    await expect(complete(token)).resolves.toMatchObject({ purpose: 'ACTIVATION' })
  })

  it('a staff email verified in Supabase can never become a user', async () => {
    const staff = await createStaff()
    // e.g. someone registered the address directly with Supabase
    await (await import('../fake-supabase')).createFakeClient().auth.signInWithOtp({ email: staff.user.email, options: { shouldCreateUser: true } })
    await expectAppError(complete(fake.lastTo(staff.user.email)!.tokenHash), 'FORBIDDEN')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: staff.user.id } })).role).toBe('STAFF')
  })

  it('a Supabase user who never finished activation is told to activate', async () => {
    fake.users.set('half@gmail.com', { id: 'sb-half', email: 'half@gmail.com', password: PW, confirmed: false, metadata: {} })
    await expectAppError(authenticate('USER', { email: 'half@gmail.com', password: PW }, null), 'FORBIDDEN', /activate/)
  })
})

describe('password reset', () => {
  it('Supabase users get a recovery link; the new password replaces the old one', async () => {
    await reg('asha@gmail.com')
    const { userId } = await complete(fake.lastTo('asha@gmail.com')!.tokenHash)
    await prisma.session.create({ data: { tokenHash: 'y'.repeat(64), userId, expiresAt: new Date(Date.now() + 60_000) } })

    await requestUserPasswordReset('asha@gmail.com', null)
    const mail = fake.lastTo('asha@gmail.com')!
    expect(mail.kind).toBe('recovery')
    await expectAppError(complete(mail.tokenHash, 'email'), 'VALIDATION') // recovery links only work as recovery
    const r = await complete(mail.tokenHash, 'recovery', 'NewPass2026')
    expect(r).toEqual({ userId, purpose: 'PASSWORD_RESET' })
    expect(await prisma.session.count({ where: { userId } })).toBe(0) // signed out elsewhere
    await expectAppError(authenticate('USER', { email: 'asha@gmail.com', password: PW }, null), 'UNAUTHORIZED')
    expect((await authenticate('USER', { email: 'asha@gmail.com', password: 'NewPass2026' }, null)).userId).toBe(userId)
  })

  it('pre-Supabase (demo) users keep their password and are moved to Supabase on reset', async () => {
    const s = await createUser({ email: 'demo.user@gmail.com' })
    expect((await authenticate('USER', { email: s.user.email, password: TEST_PASSWORD }, null)).userId).toBe(s.user.id)
    await requestUserPasswordReset(s.user.email, null)
    const r = await complete(fake.lastTo(s.user.email)!.tokenHash, 'email', 'Moved2026x')
    expect(r.purpose).toBe('PASSWORD_RESET')
    const user = await prisma.user.findUniqueOrThrow({ where: { id: s.user.id } })
    expect(user.supabaseUserId).toBeTruthy()
    expect(user.passwordHash).toBeNull()
    expect((await authenticate('USER', { email: s.user.email, password: 'Moved2026x' }, null)).userId).toBe(s.user.id)
  })

  it('sends nothing for staff or unknown emails, and is rate limited', async () => {
    const staff = await createStaff()
    await requestUserPasswordReset(staff.user.email, null)
    await requestUserPasswordReset('nobody@gmail.com', null)
    expect(fake.sent).toHaveLength(0)
    await expectAppError(requestUserPasswordReset('nobody@gmail.com', null), 'RATE_LIMITED')
  })
})
