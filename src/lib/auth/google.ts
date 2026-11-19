import 'server-only'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { env } from '@/lib/env'
import { createSupabasePkceClient, supabaseConfig } from './supabase'

// ===========================================================================
// Google Sign-In — for CUSTOMERS (USER accounts) only, at /login.
//
//  • A first-time Google user gets a USER account; a returning one is signed
//    in. Matched by Google identity, then by email, so one person never gets
//    two accounts.
//  • Staff and kitchen accounts never sign in with Google. They are created
//    by an administrator and use email + password at /login/staff and
//    /login/canteen. A staff/kitchen email arriving through Google is refused
//    and nothing is linked, created or promoted.
// Supabase Auth runs the OAuth (PKCE). A Supabase login that no CampusBite
// account owns is removed again after a refused attempt.
// ===========================================================================

export const OAUTH_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-cb_oauth' : 'cb_oauth'

export const USE_PASSWORD_LOGIN =
  'Staff and kitchen accounts can’t use Google. Sign in with your email and password at the Staff Login or Kitchen Login.'

const callbackUrl = () => `${env.appUrl.replace(/\/$/, '')}/auth/callback`

/** Google's consent URL plus the state (PKCE verifier) to keep in an HTTP-only cookie. */
export async function startGoogleSignIn(): Promise<{ url: string; state: string } | null> {
  if (!supabaseConfig().configured) return null
  const storage = new Map<string, string>()
  const client = createSupabasePkceClient(storage)
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl(), skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  })
  if (error || !data?.url) {
    console.error('[google] could not start sign-in', error?.code)
    return null
  }
  return { url: data.url, state: JSON.stringify({ storage: Object.fromEntries(storage) }) }
}

export type GoogleResult =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; reason: 'use_password' | 'deactivated' | 'failed' }

function readState(state: string | undefined): Record<string, string> | null {
  if (!state) return null
  try {
    const s = JSON.parse(state)
    return s && typeof s === 'object' && s.storage && typeof s.storage === 'object' ? s.storage : null
  } catch {
    return null
  }
}

export async function finishGoogleSignIn(code: string, state: string | undefined): Promise<GoogleResult> {
  const storage = readState(state)
  if (!supabaseConfig().configured || !code || !storage) return { ok: false, reason: 'failed' }

  const client = createSupabasePkceClient(new Map(Object.entries(storage)))
  const { data, error } = await client.auth.exchangeCodeForSession(code)
  const sbUser = data?.user
  if (error || !sbUser?.email) {
    console.error('[google] code exchange failed', error?.code)
    return { ok: false, reason: 'failed' }
  }
  const email = sbUser.email.toLowerCase()
  const verified = Boolean(sbUser.email_confirmed_at || sbUser.user_metadata?.email_verified === true)

  /** Refuse, and remove the Supabase login if no CampusBite account owns it. */
  const refuse = async (reason: 'use_password' | 'deactivated' | 'failed', entityId?: string): Promise<GoogleResult> => {
    const owned = await db.user.findFirst({ where: { supabaseUserId: sbUser.id }, select: { id: true } })
    if (!owned) await client.rpc('delete_own_user').then(() => undefined, () => undefined)
    await client.auth.signOut().catch(() => undefined)
    await audit({ action: 'auth.google_refused', entityType: 'User', entityId, metadata: { reason } })
    return { ok: false, reason }
  }

  if (!verified) return refuse('failed')

  // Google identity first, then the verified email — never a second account for the same person
  let local =
    (await db.user.findUnique({ where: { supabaseUserId: sbUser.id } })) ?? (await db.user.findUnique({ where: { email } }))
  let created = false

  // Staff and kitchen accounts use email + password only; Google never touches them
  if (local && local.role !== 'USER') return refuse('use_password', local.id)

  if (!local) {
    const name = String(sbUser.user_metadata?.full_name ?? sbUser.user_metadata?.name ?? email.split('@')[0]).slice(0, 80)
    try {
      local = await db.user.create({
        data: {
          email,
          name,
          role: 'USER', // Google only ever creates customer accounts
          status: 'ACTIVE',
          supabaseUserId: sbUser.id,
          emailVerifiedAt: new Date(),
          userProfile: { create: { integrationSource: 'google' } },
        },
      })
      created = true
      await audit({ actor: { userId: local.id, role: 'USER' }, action: 'user.signup_google', entityType: 'User', entityId: local.id })
    } catch {
      local = await db.user.findUnique({ where: { email } }) // a simultaneous first login won the race
      if (!local) return refuse('failed')
      if (local.role !== 'USER') return refuse('use_password', local.id)
    }
  }

  // The account is already linked to a different Google identity: refuse rather than merge
  if (local.supabaseUserId && local.supabaseUserId !== sbUser.id) return refuse('failed', local.id)
  if (local.status === 'DEACTIVATED') return refuse('deactivated', local.id)

  await client.auth.signOut().catch(() => undefined) // CampusBite issues its own session
  const now = new Date()
  await db.user.update({
    where: { id: local.id },
    data: {
      supabaseUserId: sbUser.id,
      status: 'ACTIVE',
      emailVerifiedAt: local.emailVerifiedAt ?? now,
      lastLoginAt: now,
    },
  })
  return { ok: true, userId: local.id, created }
}
