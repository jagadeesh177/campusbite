'use client'

import { useEffect, useState } from 'react'
import { SetPasswordForm } from './set-password-form'

type Parsed =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'session'; accessToken: string; refreshToken: string; type: string }

/**
 * Supabase's default email links verify the address on Supabase's side and then
 * redirect here with the session in the URL fragment (#access_token=…), which
 * only the browser can read. We pick it up, clear it from the address bar, and
 * let the user choose a password. (CampusBite's own templates use ?token_hash=
 * links instead — see README.)
 */
export function HashConfirm({ invalid }: { invalid: React.ReactNode }) {
  const [parsed, setParsed] = useState<Parsed>({ kind: 'loading' })

  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const accessToken = p.get('access_token')
    const refreshToken = p.get('refresh_token')
    const type = p.get('type') ?? 'signup'
    // Don't leave tokens in the address bar or browser history
    if (window.location.hash) history.replaceState(null, '', window.location.pathname)
    setParsed(
      accessToken && refreshToken && !p.get('error')
        ? { kind: 'session', accessToken, refreshToken, type }
        : { kind: 'error' },
    )
  }, [])

  if (parsed.kind === 'loading') return <p className="text-center text-sm text-muted">Checking your link…</p>
  if (parsed.kind === 'error') return <>{invalid}</>
  const reset = parsed.type === 'recovery'
  return (
    <>
      <h2 className="mb-1 text-xl font-semibold">{reset ? 'Choose a new password' : 'Create Your Password'}</h2>
      <p className="mb-6 text-sm text-muted">
        {reset ? 'Pick a new password for your CampusBite account.' : 'Your email is verified. Choose a password to activate your account.'}
      </p>
      <SetPasswordForm
        token=""
        type={parsed.type}
        purpose={reset ? 'PASSWORD_RESET' : 'ACTIVATION'}
        session={{ accessToken: parsed.accessToken, refreshToken: parsed.refreshToken }}
      />
    </>
  )
}
