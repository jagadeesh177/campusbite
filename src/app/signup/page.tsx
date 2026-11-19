import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignupForm } from '@/components/auth/signup-form'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'

export const metadata: Metadata = { title: 'Create your account' }
export const dynamic = 'force-dynamic'

export default async function SignupPage() {
  await redirectIfSignedIn()
  return (
    <AuthShell title="Create your account" subtitle="Use Google, or your Gmail address and a password.">
      <SignupForm />
    </AuthShell>
  )
}
