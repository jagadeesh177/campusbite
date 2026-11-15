import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, ChefHat, GraduationCap, ShieldCheck } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'

export const metadata: Metadata = { title: 'Login' }

const PORTALS = [
  { href: '/login/student', Icon: GraduationCap, title: 'Student', text: 'Order food and track your orders' },
  { href: '/login/canteen', Icon: ChefHat, title: 'Canteen', text: 'Manage incoming orders and pickups' },
  { href: '/login/staff', Icon: ShieldCheck, title: 'Staff & Admin', text: 'Reports, payments and accounts' },
]

export default function LoginChooserPage() {
  return (
    <AuthShell title="Welcome to CampusBite" subtitle="Choose how you’d like to sign in.">
      <ul className="space-y-3">
        {PORTALS.map(({ href, Icon, title, text }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-accent/50 hover:shadow-lift"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary group-hover:bg-primary group-hover:text-white">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-ink">{title}</span>
                <span className="block text-sm text-muted">{text}</span>
              </span>
              <ArrowRight className="h-5 w-5 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          </li>
        ))}
      </ul>
    </AuthShell>
  )
}
