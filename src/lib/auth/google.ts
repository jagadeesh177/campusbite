import 'server-only'
import type { Role } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { env } from '@/lib/env'
import { createSupabasePkceClient, supabaseConfig } from './supabase'

// ===========================================================================
// "Continue with Google" — sign-in only, never sign-up.
// Google proves the email address (via Supabase Auth). The account must
// already exist in CampusBite as a USER created by staff; the role comes from
// our database. An unknown Google account is refused, and the Supabase login
// that Supabase created for it is deleted again so nothing is left behind.
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

  const local = await db.user.findFirst({ where: { OR: [{ email }, { supabaseUserId: sbUser.id }] } })
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

  // A staff-created account that hasn't set a password yet is activated by Google's verified email
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
