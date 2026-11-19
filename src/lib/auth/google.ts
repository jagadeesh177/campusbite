import 'server-only'
import type { Role } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { env } from '@/lib/env'
import { createSupabasePkceClient, supabaseConfig } from './supabase'

// ===========================================================================
// "Continue with Google" — sign in, or create an account the first time.
// Google proves the email address (via Supabase Auth). A first-time Google
// user gets a USER account (never STAFF/CANTEEN). The same email can never
// get a second account: an existing CampusBite account is signed in instead.
// Staff and canteen accounts can't use Google; their Supabase login is removed.
// ===========================================================================

export const OAUTH_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-cb_oauth' : 'cb_oauth'
export const ACCOUNT_NOT_FOUND = 'Account not found. Please contact the administrator.'

const callbackUrl = () => `${env.appUrl.replace(/\/$/, '')}/auth/callback`

/** Returns Google's consent URL and the PKCE state to keep in a cookie. */
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
  return { url: data.url, state: JSON.stringify(Object.fromEntries(storage)) }
}

export type GoogleResult =
  | { ok: true; userId: string; role: Role }
  | { ok: false; reason: 'not_found' | 'deactivated' | 'failed' }

export async function finishGoogleSignIn(code: string, state: string | undefined): Promise<GoogleResult> {
  if (!supabaseConfig().configured || !code || !state) return { ok: false, reason: 'failed' }
  let entries: Record<string, string>
  try {
    entries = JSON.parse(state)
  } catch {
    return { ok: false, reason: 'failed' }
  }
  const client = createSupabasePkceClient(new Map(Object.entries(entries)))
  const { data, error } = await client.auth.exchangeCodeForSession(code)
  const sbUser = data?.user
  if (error || !sbUser?.email) {
    console.error('[google] code exchange failed', error?.code)
    return { ok: false, reason: 'failed' }
  }
  const email = sbUser.email.toLowerCase()

  let local = await db.user.findFirst({ where: { OR: [{ email }, { supabaseUserId: sbUser.id }] } })
  const verified = sbUser.email_confirmed_at || sbUser.user_metadata?.email_verified === true
  if (!local && verified) {
    const name = String(sbUser.user_metadata?.full_name ?? sbUser.user_metadata?.name ?? email.split('@')[0]).slice(0, 80)
    try {
      local = await db.user.create({
        data: {
          email,
          name,
          role: 'USER', // automatic; never chosen by the user
          status: 'ACTIVE',
          supabaseUserId: sbUser.id,
          emailVerifiedAt: new Date(),
          userProfile: { create: { integrationSource: 'google' } },
        },
      })
      await audit({ actor: { userId: local.id, role: 'USER' }, action: 'user.signup_google', entityType: 'User', entityId: local.id })
    } catch {
      // created by a simultaneous request: use that one
      local = await db.user.findFirst({ where: { email } })
    }
  }
  if (!local || local.role !== 'USER' || (local.supabaseUserId && local.supabaseUserId !== sbUser.id)) {
    // Remove the Supabase login created for this unknown Google account (never one a CampusBite user owns)
    const ownedByUser = await db.user.findFirst({ where: { supabaseUserId: sbUser.id }, select: { id: true } })
    if (!ownedByUser) await client.rpc('delete_own_user').then(() => undefined, () => undefined)
    await client.auth.signOut().catch(() => undefined)
    await audit({ action: 'auth.google_rejected', entityType: 'User', entityId: local?.id, metadata: { reason: local ? 'not_a_user_account' : 'no_account' } })
    return { ok: false, reason: 'not_found' }
  }
  await client.auth.signOut().catch(() => undefined) // CampusBite issues its own session
  if (local.status === 'DEACTIVATED') return { ok: false, reason: 'deactivated' }

  // A pending account (sign-up code not entered yet, or staff-created) is activated by Google's verified email
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
  await audit({ actor: { userId: local.id, role: 'USER' }, action: 'auth.google_login', entityType: 'User', entityId: local.id, metadata: { activated: local.status !== 'ACTIVE' } })
  return { ok: true, userId: local.id, role: local.role }
}
