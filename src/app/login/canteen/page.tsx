import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { GoogleSignIn } from '@/components/auth/login-form'
import { loginNotice } from '@/components/auth/login-notices'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'

export const metadata: Metadata = { title: 'Kitchen Login' }
export const dynamic = 'force-dynamic'

/** Kitchen portal: Google only, existing authorised CANTEEN accounts only. */
export default async function KitchenLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await redirectIfSignedIn()
  const { error } = await searchParams
  return (
    <AuthShell title="Kitchen Login" subtitle="Use the Google account registered for the kitchen.">
      <GoogleSignIn portal="canteen" notice={loginNotice('CANTEEN', error)} />
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="font-medium hover:text-primary hover:underline">Back to CampusBite</Link>
      </p>
    </AuthShell>
  )
}
