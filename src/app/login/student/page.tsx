import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { redirectIfSignedIn } from '@/components/auth/redirect-if-signed-in'

export const metadata: Metadata = { title: 'Student login' }

export default async function StudentLoginPage() {
  await redirectIfSignedIn()
  return (
    <AuthShell
      title="Student login"
      subtitle="Sign in with your college email to order."
      aside={{
        heading: 'Your canteen, without the queue.',
        points: ['Order from class in seconds', 'Pay with any UPI app', 'Get notified when food is ready'],
      }}
    >
      <LoginForm portal="STUDENT" emailPlaceholder="you@college.edu" />
      <div className="mt-3 text-right">
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">Forgot password?</Link>
      </div>
      <div className="mt-8 rounded-2xl border border-line bg-surface p-4 text-sm">
        <div className="font-semibold text-ink">First time here?</div>
        <p className="mt-1 text-muted">
          Activate your account with your college email — we&apos;ll check college records and email you a secure link.
        </p>
        <Link href="/activate" className="mt-3 inline-block font-semibold text-primary hover:text-primary-hover hover:underline">
          Activate my account →
        </Link>
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        Canteen or college staff? <Link href="/login" className="font-medium text-primary hover:underline">Use your portal</Link>
      </p>
    </AuthShell>
  )
}
