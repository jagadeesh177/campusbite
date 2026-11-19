import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase Auth is used for USERS only: Google sign-in, email verification of
 * staff-created accounts, password management and login. There is no public sign-up. Staff and canteen accounts keep the
 * administrator-managed login in src/lib/auth/login.ts.
 *
 * Only the project URL and the public (anon / publishable) key are needed — every
 * call is made on behalf of the user, never with the service-role key.
 * After Supabase confirms who the user is, CampusBite issues its own
 * HTTP-only session (src/lib/auth/session.ts), so the dashboards, ordering and
 * payments keep working unchanged.
 */
export function supabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    ''
  return { url, key, configured: Boolean(url && key) }
}

/** A fresh, per-request client that keeps its session in memory only. */
export function createSupabaseAuthClient(): SupabaseClient {
  const { url, key, configured } = supabaseConfig()
  if (!configured) throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY)')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/**
 * Client for the Google sign-in code exchange (PKCE). Supabase keeps the code
 * verifier in `storage`; we persist that map in a short-lived HTTP-only cookie
 * between the redirect to Google and the callback.
 */
export function createSupabasePkceClient(storage: Map<string, string>): SupabaseClient {
  const { url, key, configured } = supabaseConfig()
  if (!configured) throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY)')
  return createClient(url, key, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (k) => storage.get(k) ?? null,
        setItem: (k, v) => void storage.set(k, v),
        removeItem: (k) => void storage.delete(k),
      },
    },
  })
}
