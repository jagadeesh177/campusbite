import 'server-only'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { PORTAL_HOME } from '@/lib/auth/guards'

export async function redirectIfSignedIn() {
  const user = await getSessionUser()
  if (user) redirect(PORTAL_HOME[user.role])
}
