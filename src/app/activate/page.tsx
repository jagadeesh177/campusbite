import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { LinkRequestForm } from '@/components/auth/link-request-form'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'
import { Notice } from '@/components/ui/misc'
import { env } from '@/lib/env'
import { getCollegeProvider } from '@/lib/college'

export const metadata: Metadata = { title: 'Activate your account' }
export const dynamic = 'force-dynamic'

export default async function ActivatePage() {
  await redirectIfSignedIn()
  const provider = getCollegeProvider()
  return (
    <AuthShell
      title="Activate Your Account"
      subtitle="Verify your college email to get started with CampusBite."
      aside={{
        heading: 'College-exclusive access.',
        points: ['Checked against college student records', 'Secure one-time activation link', 'Only enrolled students can order'],
      }}
    >
      {provider.isMock && (
        <Notice tone="warning" title="Demo verification" className="mb-6">
          Emails are checked against a <strong>mock</strong> college directory, not the real college database.
        </Notice>
      )}
      <LinkRequestForm purpose="ACTIVATION" devMailbox={env.devToolsEnabled && env.emailProvider === 'dev-outbox'} />
      <p className="mt-8 text-center text-sm text-muted">
        Already activated? <Link href="/login/student" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
