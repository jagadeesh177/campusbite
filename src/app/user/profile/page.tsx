import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requirePortalUser } from '@/lib/auth/guards'
import { PersonalInfo } from './personal-info'
import { AccountSecurity } from './account-security'
import { DeleteAccount } from './delete-account'

export const metadata: Metadata = { title: 'Profile' }
export const dynamic = 'force-dynamic'

/** Simple settings page: see your details, edit when needed, password and delete tucked away. */
export default async function ProfilePage() {
  const user = await requirePortalUser('USER')
  const profile = await db.userProfile.findUnique({ where: { userId: user.id } })

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-ink">Profile</h1>

      <PersonalInfo
        details={{
          fullName: user.name,
          email: user.email,
          department: profile?.department ?? '',
          phone: profile?.phone ?? '',
          dietaryPreference: profile?.dietaryPreference ?? 'NO_PREFERENCE',
        }}
      />

      <section aria-labelledby="security-title">
        <h2 id="security-title" className="mb-3 text-lg font-semibold text-ink">Account Security</h2>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
          <AccountSecurity />
        </div>
      </section>

      <section aria-labelledby="danger-title" className="border-t border-line pt-6">
        <h2 id="danger-title" className="mb-3 text-sm font-semibold uppercase tracking-wide text-danger-ink">Danger Zone</h2>
        <DeleteAccount />
      </section>
    </div>
  )
}
