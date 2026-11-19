'use server'

import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { toActionError } from '@/lib/errors'
import { getClientInfo } from '@/lib/request'
import { authenticate, changeOwnPassword } from '@/lib/auth/login'
import { createSession, destroySession, getSessionUser } from '@/lib/auth/session'
import { PORTAL_HOME, PORTAL_LOGIN } from '@/lib/auth/guards'

// Customers sign in with Google (src/app/auth/google + src/app/auth/callback).
// Staff and kitchen accounts sign in here with the email + password an
// administrator gave them.

export type FormState =
  | {
      error?: string
      fieldErrors?: Record<string, string[] | undefined>
      email?: string
    }
  | undefined

/** Staff / Kitchen login. The portal is fixed by the page; the role always comes from the database. */
export async function passwordLoginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const portal = formData.get('portal') === 'CANTEEN' ? 'CANTEEN' : 'STAFF'
  const email = String(formData.get('email') ?? '')
  const remember = formData.get('remember') === 'on'
  const { ip } = await getClientInfo()
  let result
  try {
    result = await authenticate(portal, { email, password: String(formData.get('password') ?? '') }, ip)
  } catch (e) {
    return { error: toActionError(e).error, email }
  }
  await createSession(result.userId, result.role, { remember })
  redirect(result.mustChangePassword ? '/account/password' : PORTAL_HOME[result.role])
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser()
  if (!user) redirect('/login/staff')
  if (user.role === 'USER') redirect(PORTAL_HOME.USER)
  let r
  try {
    r = await changeOwnPassword(
      { userId: user.id, sessionId: user.sessionId },
      {
        currentPassword: String(formData.get('currentPassword') ?? ''),
        newPassword: String(formData.get('newPassword') ?? ''),
        confirmPassword: String(formData.get('confirmPassword') ?? ''),
      },
    )
  } catch (e) {
    return toActionError(e)
  }
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors }
  redirect(PORTAL_HOME[user.role])
}

export async function logoutAction() {
  const user = await getSessionUser()
  if (user && user.role !== 'USER') {
    await audit({ actor: { userId: user.id, role: user.role }, action: 'auth.logout', entityType: 'User', entityId: user.id })
  }
  await destroySession()
  redirect(user && user.role !== 'USER' ? PORTAL_LOGIN[user.role] : '/')
}
