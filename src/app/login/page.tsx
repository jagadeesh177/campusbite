import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { GoogleSignIn } from '@/components/auth/login-form'
import { loginNotice } from '@/components/auth/login-notices'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'

export const metadata: Metadata = { title: 'Sign in' }
export const dynamic = 'force-dynamic'

/** Main portal: Google only. First-time Google users get a USER account automatically. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await redirectIfSignedIn()
  const { error } = await searchParams
  return (
    <AuthShell title="Welcome to CampusBite" subtitle="Sign in to order your favourite food">
      <GoogleSignIn portal="user" notice={loginNotice('USER', error)} />
      <p className="mt-8 text-center text-xs text-subtle">
        New here? Continue with Google and your account is created instantly.
      </p>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login/staff" className="font-medium hover:text-primary hover:underline">Staff login</Link>
        <span className="mx-2 text-subtle">·</span>
        <Link href="/login/canteen" className="font-medium hover:text-primary hover:underline">Kitchen login</Link>
      </p>
    </AuthShell>
  )
}
