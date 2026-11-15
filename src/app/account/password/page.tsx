import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { getSessionUser } from '@/lib/auth/session'
import { ChangePasswordForm } from './form'

export const metadata: Metadata = { title: 'Change password' }

export default async function ChangePasswordPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return (
    <AuthShell
      title={user.mustChangePassword ? 'Set your own password' : 'Change password'}
      subtitle={
        user.mustChangePassword
          ? 'Your account was created with a temporary password. Choose a new one to continue.'
          : 'Other devices will be signed out.'
      }
    >
      <ChangePasswordForm />
    </AuthShell>
  )
}
