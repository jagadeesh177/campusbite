import 'server-only'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { PORTAL_HOME } from '@/lib/auth/guards'

export async function redirectIfSignedIn() {
  const user = await getSessionUser()
  if (user) redirect(user.mustChangePassword ? '/account/password' : PORTAL_HOME[user.role])
}
