import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'
import { env } from '@/lib/env'
import { ActivateForm } from './activate-form'

export const metadata: Metadata = { title: 'Activate your account' }

export default async function ActivatePage() {
  await redirectIfSignedIn()
  return (
    <AuthShell
      title="Activate your account"
      subtitle="We’ll check your enrollment with college records and email you a one-time code."
      aside={{
        heading: 'College-exclusive access.',
        points: ['Verified against college records', 'No copy of the college database', 'Your data stays minimal'],
      }}
    >
      <ActivateForm devMailbox={env.devToolsEnabled && env.emailProvider === 'dev-outbox'} />
      <p className="mt-8 text-center text-sm text-muted">
        Already activated? <Link href="/login/student" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
