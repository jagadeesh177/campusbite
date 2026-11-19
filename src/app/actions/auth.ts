'use server'

import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { destroySession, getSessionUser } from '@/lib/auth/session'

// Sign-in is Google only (src/app/auth/google + src/app/auth/callback). The only
// auth action left is signing out.

export async function logoutAction() {
  const user = await getSessionUser()
  if (user && user.role !== 'USER') {
    await audit({ actor: { userId: user.id, role: user.role }, action: 'auth.logout', entityType: 'User', entityId: user.id })
  }
  await destroySession()
  redirect('/')
}
