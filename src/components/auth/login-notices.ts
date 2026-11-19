import { NOT_AUTHORIZED, type Portal } from '@/lib/auth/google'

/** Messages shown on a login page after a failed or cancelled Google sign-in. */
export function loginNotice(portal: Portal, error: string | undefined): { tone: 'danger' | 'info'; text: string } | undefined {
  switch (error) {
    case 'not_authorized':
      return { tone: 'danger', text: NOT_AUTHORIZED[portal] }
    case 'deactivated':
      return { tone: 'danger', text: 'This account has been deactivated. Please contact the canteen office.' }
    case 'google_cancelled':
      return { tone: 'info', text: 'Google sign-in was cancelled.' }
    case 'google_unavailable':
      return { tone: 'danger', text: 'Google sign-in isn’t available right now. Please try again shortly.' }
    case 'rate_limited':
      return { tone: 'danger', text: 'Too many attempts. Please wait a few minutes and try again.' }
    case 'google_failed':
    case 'failed':
      return { tone: 'danger', text: 'Google sign-in didn’t complete. Please try again.' }
    default:
      return undefined
  }
}
