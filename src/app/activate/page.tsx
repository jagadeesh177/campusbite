import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { LinkRequestForm } from '@/components/auth/link-request-form'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'

export const metadata: Metadata = { title: 'User Registration' }
export const dynamic = 'force-dynamic'

export default async function ActivatePage() {
  await redirectIfSignedIn()
  return (
    <AuthShell
      title="Create Your CampusBite Account"
      subtitle="Sign up with your personal email and start ordering your favourite food."
      aside={{
        heading: 'Skip the queue in minutes.',
        points: ['Sign up with any personal email', 'Secure one-time activation link', 'Order, pay and track from your phone'],
      }}
    >
      <LinkRequestForm purpose="ACTIVATION" />
      <p className="mt-8 text-center text-sm text-muted">
        Already have an account? <Link href="/login/user" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
