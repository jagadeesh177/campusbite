import { randomBytes } from 'node:crypto'

/**
 * In-memory stand-in for Supabase Auth used by the tests. It enforces what the
 * real service enforces for us: single-use links, link expiry, unconfirmed users
 * can't sign in, and recovery links only work as recovery links.
 */
type FakeUser = { id: string; email: string; password?: string; confirmed: boolean; metadata: Record<string, unknown> }
type FakeToken = { email: string; kind: 'email' | 'recovery'; expiresAt: number; used: boolean }
export type SentEmail = { to: string; kind: 'email' | 'recovery'; tokenHash: string; redirectTo?: string }

export const fake = {
  users: new Map<string, FakeUser>(),
  tokens: new Map<string, FakeToken>(),
  sent: [] as SentEmail[],
  sessions: new Map<string, { email: string; refresh: string; revoked: boolean }>(),
  failNextSend: false,
  configured: true,
  ttlMs: 15 * 60_000,
  reset() {
    this.users.clear()
    this.tokens.clear()
    this.sent = []
    this.sessions.clear()
    this.failNextSend = false
    this.configured = true
  },
  /** What Supabase's default link does: verify on Supabase's side, then hand the browser a session. */
  clickDefaultLink(tokenHash: string) {
    const t = this.tokens.get(tokenHash)
    if (!t || t.used || t.expiresAt < Date.now()) return null
    t.used = true
    this.users.get(t.email)!.confirmed = true
    const access = `at_${randomBytes(16).toString('hex')}`
    const refresh = `rt_${randomBytes(8).toString('hex')}`
    this.sessions.set(access, { email: t.email, refresh, revoked: false })
    return { accessToken: access, refreshToken: refresh, type: t.kind === 'recovery' ? 'recovery' : 'signup' }
  },
  lastTo(email: string) {
    return [...this.sent].reverse().find((m) => m.to === email)
  },
}

const err = (code: string, status = 400) => ({ code, status, message: code, name: 'AuthApiError' })

function issue(email: string, kind: 'email' | 'recovery', redirectTo?: string) {
  const tokenHash = randomBytes(28).toString('hex')
  fake.tokens.set(tokenHash, { email, kind, expiresAt: Date.now() + fake.ttlMs, used: false })
  fake.sent.push({ to: email, kind, tokenHash, redirectTo })
}

function publicUser(u: FakeUser) {
  return { id: u.id, email: u.email, user_metadata: u.metadata }
}

export function createFakeClient() {
  let current: FakeUser | null = null
  return {
    auth: {
      async signInWithOtp({ email, options }: { email: string; options?: { shouldCreateUser?: boolean; emailRedirectTo?: string; data?: Record<string, unknown> } }) {
        if (fake.failNextSend) {
          fake.failNextSend = false
          return { data: {}, error: err('unexpected_failure', 500) }
        }
        let u = fake.users.get(email)
        if (!u) {
          if (options?.shouldCreateUser === false) return { data: {}, error: err('otp_disabled') }
          u = { id: `sb-${randomBytes(6).toString('hex')}`, email, confirmed: false, metadata: options?.data ?? {} }
          fake.users.set(email, u)
        }
        issue(email, 'email', options?.emailRedirectTo)
        return { data: {}, error: null }
      },
      async resetPasswordForEmail(email: string, opts?: { redirectTo?: string }) {
        if (fake.failNextSend) {
          fake.failNextSend = false
          return { data: {}, error: err('unexpected_failure', 500) }
        }
        if (fake.users.has(email)) issue(email, 'recovery', opts?.redirectTo)
        return { data: {}, error: null }
      },
      async verifyOtp({ token_hash, type }: { token_hash: string; type: string }) {
        const t = fake.tokens.get(token_hash)
        const kindOk = t && (type === 'recovery' ? t.kind === 'recovery' : t.kind === 'email')
        if (!t || t.used || t.expiresAt < Date.now() || !kindOk) {
          return { data: { user: null, session: null }, error: err('otp_expired', 403) }
        }
        t.used = true
        const u = fake.users.get(t.email)!
        u.confirmed = true
        current = u
        return { data: { user: publicUser(u), session: { access_token: 'x' } }, error: null }
      },
      async updateUser({ password }: { password: string }) {
        if (!current) return { data: { user: null }, error: err('session_not_found', 401) }
        if (current.password === password) return { data: { user: null }, error: err('same_password', 422) }
        current.password = password
        return { data: { user: publicUser(current) }, error: null }
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const u = fake.users.get(email)
        if (u && !u.confirmed && u.password === password) return { data: { user: null }, error: err('email_not_confirmed') }
        if (!u || !u.password || u.password !== password) return { data: { user: null }, error: err('invalid_credentials') }
        current = u
        return { data: { user: publicUser(u), session: { access_token: 'x' } }, error: null }
      },
      async setSession({ access_token, refresh_token }: { access_token: string; refresh_token: string }) {
        const sess = fake.sessions.get(access_token)
        if (!sess || sess.revoked || sess.refresh !== refresh_token) {
          return { data: { user: null, session: null }, error: err('session_not_found', 403) }
        }
        current = fake.users.get(sess.email)!
        return { data: { user: publicUser(current), session: { access_token } }, error: null }
      },
      async signOut() {
        if (current) for (const sess of fake.sessions.values()) if (sess.email === current.email) sess.revoked = true
        current = null
        return { error: null }
      },
    },
    /** public.delete_own_user(): deletes the signed-in user's own login */
    async rpc(fn: string) {
      if (fn !== 'delete_own_user' || !current) return { data: null, error: err('not_allowed', 401) }
      fake.users.delete(current.email)
      return { data: null, error: null }
    },
  }
}

export const fakeSupabaseModule = {
  supabaseConfig: () => ({ url: 'https://test.supabase.co', key: 'test', configured: fake.configured }),
  createSupabaseAuthClient: () => createFakeClient(),
}
