import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/supabase', async () => (await import('../fake-supabase')).fakeSupabaseModule)

const { fake } = await import('../fake-supabase')
const { completeUserLink, inviteUser, changeSupabasePassword } = await import('@/lib/auth/user-auth')
const { authenticate, authenticateAny } = await import('@/lib/auth/login')
const recovery = await import('@/lib/auth/recovery')
const { finishGoogleSignIn, startGoogleSignIn, ACCOUNT_NOT_FOUND } = await import('@/lib/auth/google')
const { AppError } = await import('@/lib/errors')
const { createCanteen, createStaff, prisma, resetDb, TEST_PASSWORD } = await import('../helpers')

const PW = 'Campus2026!'
const PW2 = 'Second2026!'
const PW3 = 'Third2026!x'

async function expectAppError(p: Promise<unknown>, code: InstanceType<typeof AppError>['code'], message?: RegExp) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code && (!message || message.test(e.message)))
}

/** Staff creates the account; the user sets a password from the emailed link. */
async function invitedUser(email = 'asha@gmail.com', activate = true) {
  const staff = await createStaff(['USERS'])
  const { userId } = await inviteUser(staff.actor, { email, fullName: 'Asha Kumar', phone: '9876543210' })
  if (activate) await completeUserLink({ tokenHash: fake.lastTo(email)!.tokenHash, type: 'email', password: PW, confirmPassword: PW }, null)
  return { userId, staff }
}

async function googleSignIn(email: string) {
  const start = await startGoogleSignIn()
  return finishGoogleSignIn(fake.googleCode(email), start!.state)
}

beforeEach(async () => {
  await resetDb()
  fake.reset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('no public sign-up: accounts are created by staff', () => {
  it('staff with USERS permission create a pending USER and an activation email is sent', async () => {
    const { userId } = await invitedUser('asha@gmail.com', false)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(user).toMatchObject({ role: 'USER', status: 'PENDING_VERIFICATION', passwordHash: null })
    expect(fake.lastTo('asha@gmail.com')?.kind).toBe('email')
    await expectAppError(authenticateAny({ email: 'asha@gmail.com', password: PW }, null), 'UNAUTHORIZED')
  })

  it('only staff with the USERS permission can create accounts; duplicates are refused', async () => {
    const noPerm = await createStaff(['REPORTS'])
    await expectAppError(inviteUser(noPerm.actor, { email: 'x@gmail.com', fullName: 'X Person' }), 'FORBIDDEN')
    const kitchen = await createCanteen()
    await expectAppError(inviteUser(kitchen.actor, { email: 'x@gmail.com', fullName: 'X Person' }), 'FORBIDDEN')
    await invitedUser('dup@gmail.com', false)
    const staff = await createStaff(['USERS'])
    await expectAppError(inviteUser(staff.actor, { email: 'dup@gmail.com', fullName: 'Dup Person' }), 'CONFLICT')
  })

  it('an activation link for an email without a CampusBite account cannot create one', async () => {
    // e.g. someone calls Supabase sign-up directly with the public key
    await (await import('../fake-supabase')).createFakeClient().auth.signInWithOtp({ email: 'stranger@gmail.com', options: { shouldCreateUser: true } })
    await expectAppError(
      completeUserLink({ tokenHash: fake.lastTo('stranger@gmail.com')!.tokenHash, type: 'email', password: PW, confirmPassword: PW }, null),
      'FORBIDDEN',
      /Account not found/,
    )
    expect(await prisma.user.count({ where: { email: 'stranger@gmail.com' } })).toBe(0)
  })
})

describe('email + password sign-in (one page for every role)', () => {
  it('existing user, staff and canteen sign in; role comes from the database', async () => {
    const { userId } = await invitedUser()
    const staff = await createStaff()
    const canteen = await createCanteen()
    expect(await authenticateAny({ email: 'asha@gmail.com', password: PW }, null)).toMatchObject({ userId, role: 'USER' })
    expect((await authenticateAny({ email: staff.user.email, password: TEST_PASSWORD }, null)).role).toBe('STAFF')
    expect((await authenticateAny({ email: canteen.user.email, password: TEST_PASSWORD }, null)).role).toBe('CANTEEN')
  })

  it('wrong password and unknown email get the same answer', async () => {
    await invitedUser()
    await expectAppError(authenticateAny({ email: 'asha@gmail.com', password: 'Wrong2026!' }, null), 'UNAUTHORIZED', /Incorrect email or password/)
    await expectAppError(authenticateAny({ email: 'nobody@gmail.com', password: PW }, null), 'UNAUTHORIZED', /Incorrect email or password/)
  })

  it('login is rate limited', async () => {
    await invitedUser()
    for (let i = 0; i < 5; i++) await authenticate('USER', { email: 'asha@gmail.com', password: 'Wrong2026!' }, null).catch(() => null)
    await expectAppError(authenticateAny({ email: 'asha@gmail.com', password: PW }, null), 'RATE_LIMITED')
  })
})

describe('Continue with Google (sign-in only)', () => {
  it('an existing user signs in with their Google account', async () => {
    const { userId } = await invitedUser()
    expect(await googleSignIn('Asha@gmail.com')).toEqual({ ok: true, userId, role: 'USER' })
  })

  it('a staff-created account that never set a password is activated by Google', async () => {
    const { userId } = await invitedUser('new@gmail.com', false)
    expect(await googleSignIn('new@gmail.com')).toMatchObject({ ok: true, userId })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe('ACTIVE')
  })

  it('an unknown Google user is refused, no account is created and the Supabase login is removed', async () => {
    const r = await googleSignIn('stranger@gmail.com')
    expect(r).toEqual({ ok: false, reason: 'not_found' })
    expect(ACCOUNT_NOT_FOUND).toBe('Account not found. Please contact the administrator.')
    expect(await prisma.user.count({ where: { email: 'stranger@gmail.com' } })).toBe(0)
    expect(fake.users.has('stranger@gmail.com')).toBe(false)
  })

  it('staff/canteen emails cannot be used through Google; deactivated users are refused', async () => {
    const staff = await createStaff()
    expect(await googleSignIn(staff.user.email)).toEqual({ ok: false, reason: 'not_found' })
    const { userId } = await invitedUser('gone@gmail.com')
    await prisma.user.update({ where: { id: userId }, data: { status: 'DEACTIVATED' } })
    expect(await googleSignIn('gone@gmail.com')).toEqual({ ok: false, reason: 'deactivated' })
  })

  it('a code without the matching PKCE state is rejected', async () => {
    await invitedUser()
    expect(await finishGoogleSignIn(fake.googleCode('asha@gmail.com'), JSON.stringify({}))).toEqual({ ok: false, reason: 'failed' })
  })
})

describe('forgot password: 15-minute recovery', () => {
  async function requestAndOpen(email = 'asha@gmail.com') {
    await recovery.requestPasswordRecovery(email, null)
    const mail = fake.lastTo(email)!
    expect(mail.kind).toBe('recovery')
    return recovery.startRecoverySession({ tokenHash: mail.tokenHash }, null)
  }

  it('emails a reset link only for registered accounts (same answer for everyone)', async () => {
    await invitedUser()
    const staff = await createStaff()
    await recovery.requestPasswordRecovery('nobody@gmail.com', null)
    await recovery.requestPasswordRecovery(staff.user.email, null)
    expect(fake.sent.filter((m) => m.kind === 'recovery')).toHaveLength(0)
    await recovery.requestPasswordRecovery('asha@gmail.com', null)
    expect(fake.sent.filter((m) => m.kind === 'recovery').map((m) => m.to)).toEqual(['asha@gmail.com'])
    const reset = await prisma.passwordReset.findFirstOrThrow()
    expect(reset.expiresAt.getTime() - reset.requestedAt.getTime()).toBe(15 * 60_000)
  })

  it('a valid link opens a recovery session; the password can be changed several times inside it', async () => {
    const { userId } = await invitedUser()
    const start = await requestAndOpen()
    expect(start.ok).toBe(true)
    if (!start.ok) return
    let sb = start.supabase
    for (const pw of [PW2, PW3]) {
      const r = await recovery.changePasswordInRecovery(start.token, sb, { password: pw, confirmPassword: pw })
      sb = r.supabase
    }
    expect((await authenticateAny({ email: 'asha@gmail.com', password: PW3 }, null)).userId).toBe(userId)
    await expectAppError(authenticateAny({ email: 'asha@gmail.com', password: PW2 }, null), 'UNAUTHORIZED')
    expect((await prisma.recoverySession.findFirstOrThrow()).passwordChanges).toBe(2)
  })

  it('validates strength and matching passwords', async () => {
    await invitedUser()
    const start = await requestAndOpen()
    if (!start.ok) throw new Error('no session')
    await expectAppError(recovery.changePasswordInRecovery(start.token, start.supabase, { password: 'short', confirmPassword: 'short' }), 'VALIDATION')
    await expectAppError(recovery.changePasswordInRecovery(start.token, start.supabase, { password: PW2, confirmPassword: PW3 }), 'VALIDATION', /do not match/)
  })

  it('the link is single use (replay refused)', async () => {
    await invitedUser()
    await recovery.requestPasswordRecovery('asha@gmail.com', null)
    const token = fake.lastTo('asha@gmail.com')!.tokenHash
    expect((await recovery.startRecoverySession({ tokenHash: token }, null)).ok).toBe(true)
    expect(await recovery.startRecoverySession({ tokenHash: token }, null)).toEqual({ ok: false, reason: 'expired' })
  })

  it('the session stops exactly when the 15-minute window ends; the expired link cannot reset', async () => {
    await invitedUser()
    const start = await requestAndOpen()
    if (!start.ok) throw new Error('no session')
    const reset = await prisma.passwordReset.findFirstOrThrow()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(reset.expiresAt.getTime() - 1000))
    expect((await recovery.getRecoverySession(start.token)).valid).toBe(true)
    vi.setSystemTime(new Date(reset.expiresAt.getTime() + 1))
    expect((await recovery.getRecoverySession(start.token)).valid).toBe(false)
    await expectAppError(recovery.changePasswordInRecovery(start.token, start.supabase, { password: PW2, confirmPassword: PW2 }), 'CONFLICT', /expired/)
  })

  it('a link opened after the window (even if Supabase still accepted it) is refused', async () => {
    await invitedUser()
    await recovery.requestPasswordRecovery('asha@gmail.com', null)
    await prisma.passwordReset.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect(await recovery.startRecoverySession({ tokenHash: fake.lastTo('asha@gmail.com')!.tokenHash }, null)).toEqual({ ok: false, reason: 'expired' })
  })

  it('a new request invalidates the previous link and session; the new link gets its own 15 minutes', async () => {
    await invitedUser()
    const first = await requestAndOpen()
    if (!first.ok) throw new Error('no session')
    await prisma.rateLimitBucket.deleteMany() // past the 1-minute resend guard
    const second = await requestAndOpen()
    expect(second.ok).toBe(true)
    expect((await recovery.getRecoverySession(first.token)).valid).toBe(false)
    await expectAppError(recovery.changePasswordInRecovery(first.token, first.supabase, { password: PW2, confirmPassword: PW2 }), 'CONFLICT')
    const resets = await prisma.passwordReset.findMany({ orderBy: { requestedAt: 'asc' } })
    expect(resets[0].revokedAt).not.toBeNull()
    expect(resets[1].revokedAt).toBeNull()
  })

  it('a recovery session cannot be used for another account', async () => {
    await invitedUser('asha@gmail.com')
    await invitedUser('ravi@gmail.com')
    const a = await requestAndOpen('asha@gmail.com')
    await prisma.rateLimitBucket.deleteMany()
    const b = await requestAndOpen('ravi@gmail.com')
    if (!a.ok || !b.ok) throw new Error('no session')
    // Asha's recovery cookie with Ravi's Supabase tokens
    await expectAppError(recovery.changePasswordInRecovery(a.token, b.supabase, { password: PW2, confirmPassword: PW2 }), 'CONFLICT')
  })

  it('ending the session (Done) makes it unusable', async () => {
    await invitedUser()
    const s = await requestAndOpen()
    if (!s.ok) throw new Error('no session')
    await recovery.endRecoverySession(s.token, s.supabase)
    expect((await recovery.getRecoverySession(s.token)).valid).toBe(false)
  })

  it('a password change signs the account out everywhere', async () => {
    const { userId } = await invitedUser()
    await prisma.session.create({ data: { tokenHash: 'h1', userId, expiresAt: new Date(Date.now() + 3600e3) } })
    const s = await requestAndOpen()
    if (!s.ok) throw new Error('no session')
    await recovery.changePasswordInRecovery(s.token, s.supabase, { password: PW2, confirmPassword: PW2 })
    expect(await prisma.session.count({ where: { userId } })).toBe(0)
  })

  it('a pending (staff-created) user gets the activation link again instead', async () => {
    await invitedUser('new@gmail.com', false)
    await prisma.rateLimitBucket.deleteMany()
    await recovery.requestPasswordRecovery('new@gmail.com', null)
    expect(fake.sent.filter((m) => m.to === 'new@gmail.com').map((m) => m.kind)).toEqual(['email', 'email'])
  })

  it('reset requests are rate limited', async () => {
    await invitedUser()
    for (let i = 0; i < 5; i++) await recovery.requestPasswordRecovery('asha@gmail.com', null)
    await expectAppError(recovery.requestPasswordRecovery('asha@gmail.com', null), 'RATE_LIMITED')
  })
})

describe('signed-in password change still works', () => {
  it('checks the current password and switches to the new one', async () => {
    await invitedUser()
    expect(await changeSupabasePassword('asha@gmail.com', 'Wrong2026!', PW2)).toBe('wrong_current')
    expect(await changeSupabasePassword('asha@gmail.com', PW, PW2)).toBe('ok')
    expect((await authenticateAny({ email: 'asha@gmail.com', password: PW2 }, null)).role).toBe('USER')
  })
})
