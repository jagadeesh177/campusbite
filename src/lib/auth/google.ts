import 'server-only'
import type { Role } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { env } from '@/lib/env'
import { createSupabasePkceClient, supabaseConfig } from './supabase'

// ===========================================================================
// Google Sign-In — the ONLY way into CampusBite (all three portals).
//
//  • Main portal (USER): a first-time Google user gets a USER account; a
//    returning one is signed in. Matched by Google identity, then by email, so
//    one person never gets two accounts.
//  • Staff portal / Kitchen portal: only an existing, ACTIVE STAFF / CANTEEN
//    account with that Google email may enter. Nothing is ever created or
//    promoted here.
//  • Google never changes an existing account's role; the role always comes
//    from our database.
// Supabase Auth runs the OAuth (PKCE). A Supabase login that no CampusBite
// account owns is removed again after a refused attempt.
// ===========================================================================

export type Portal = 'USER' | 'STAFF' | 'CANTEEN'
export const PORTALS: Portal[] = ['USER', 'STAFF', 'CANTEEN']

export const OAUTH_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-cb_oauth' : 'cb_oauth'

export const NOT_AUTHORIZED: Record<Portal, string> = {
  USER: 'You are not authorized to access CampusBite.',
  STAFF: 'You are not authorized to access the Staff Portal.',
  CANTEEN: 'You are not authorized to access the Kitchen Portal.',
}

export const PORTAL_LOGIN_PATH: Record<Portal, string> = { USER: '/login', STAFF: '/login/staff', CANTEEN: '/login/canteen' }

export function parsePortal(raw: string | null | undefined): Portal {
  const v = (raw ?? '').toUpperCase()
  return v === 'STAFF' ? 'STAFF' : v === 'CANTEEN' || v === 'KITCHEN' ? 'CANTEEN' : 'USER'
}

const callbackUrl = () => `${env.appUrl.replace(/\/$/, '')}/auth/callback`

/** Google's consent URL plus the state (PKCE verifier + portal) to keep in an HTTP-only cookie. */
export async function startGoogleSignIn(portal: Portal): Promise<{ url: string; state: string } | null> {
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
  return { url: data.url, state: JSON.stringify({ portal, storage: Object.fromEntries(storage) }) }
}

export type GoogleResult =
  | { ok: true; userId: string; role: Role; created: boolean; portal: Portal }
  | { ok: false; reason: 'not_authorized' | 'deactivated' | 'failed'; portal: Portal }

export function readState(state: string | undefined): { portal: Portal; storage: Record<string, string> } | null {
  if (!state) return null
  try {
    const s = JSON.parse(state)
    if (!s || typeof s !== 'object' || typeof s.storage !== 'object') return null
    return { portal: parsePortal(s.portal), storage: s.storage }
  } catch {
    return null
  }
}

export async function finishGoogleSignIn(code: string, state: string | undefined): Promise<GoogleResult> {
  const st = readState(state)
  const portal = st?.portal ?? 'USER'
  if (!supabaseConfig().configured || !code || !st) return { ok: false, reason: 'failed', portal }

  const client = createSupabasePkceClient(new Map(Object.entries(st.storage)))
  const { data, error } = await client.auth.exchangeCodeForSession(code)
  const sbUser = data?.user
  if (error || !sbUser?.email) {
    console.error('[google] code exchange failed', error?.code)
    return { ok: false, reason: 'failed', portal }
  }
  const email = sbUser.email.toLowerCase()
  const verified = Boolean(sbUser.email_confirmed_at || sbUser.user_metadata?.email_verified === true)

  /** Refuse, and remove the Supabase login if no CampusBite account owns it. */
  const refuse = async (reason: 'not_authorized' | 'deactivated' | 'failed', entityId?: string): Promise<GoogleResult> => {
    const owned = await db.user.findFirst({ where: { supabaseUserId: sbUser.id }, select: { id: true } })
    if (!owned) await client.rpc('delete_own_user').then(() => undefined, () => undefined)
    await client.auth.signOut().catch(() => undefined)
    await audit({ action: 'auth.google_refused', entityType: 'User', entityId, metadata: { portal, reason } })
    return { ok: false, reason, portal }
  }

  if (!verified) return refuse('failed')

  // Google identity first, then the verified email — never a second account for the same person
  let local =
    (await db.user.findUnique({ where: { supabaseUserId: sbUser.id } })) ?? (await db.user.findUnique({ where: { email } }))
  let created = false

  if (portal !== 'USER') {
    // Staff / Kitchen portals: existing, authorised accounts only
    if (!local || local.role !== portal) return refuse('not_authorized', local?.id)
  } else if (!local) {
    const name = String(sbUser.user_metadata?.full_name ?? sbUser.user_metadata?.name ?? email.split('@')[0]).slice(0, 80)
    try {
      local = await db.user.create({
        data: {
          email,
          name,
          role: 'USER', // first-time Google users are always USERs
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
      supabaseUserId: sbUser.id, // links an existing account to its Google identity (role untouched)
      status: 'ACTIVE',
      emailVerifiedAt: local.emailVerifiedAt ?? now,
      lastLoginAt: now,
    },
  })
  await audit({ actor: { userId: local.id, role: local.role }, action: 'auth.login', entityType: 'User', entityId: local.id, metadata: { via: 'google', portal } })
  return { ok: true, userId: local.id, role: local.role, created, portal }
}
