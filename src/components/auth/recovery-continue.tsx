import { KeyRound } from 'lucide-react'
import { startRecoveryAction } from '@/app/actions/auth'
import { SubmitButton } from '@/components/ui/client'

/**
 * The emailed link is only used when the user presses Continue (a POST), so
 * email security scanners that pre-open links can't use it up.
 */
export function RecoveryContinue({ token, session }: { token?: string; session?: { accessToken: string; refreshToken: string } }) {
  return (
    <form action={startRecoveryAction} className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <KeyRound className="h-7 w-7" aria-hidden />
      </div>
      <p className="mt-4 text-sm text-muted">Press Continue to set a new password. The reset link is valid for 15 minutes from when it was sent.</p>
      {token && <input type="hidden" name="token" value={token} />}
      {session && (
        <>
          <input type="hidden" name="accessToken" value={session.accessToken} />
          <input type="hidden" name="refreshToken" value={session.refreshToken} />
        </>
      )}
      <SubmitButton size="lg" className="mt-6 w-full" pendingText="Checking…">
        Continue
      </SubmitButton>
    </form>
  )
}
