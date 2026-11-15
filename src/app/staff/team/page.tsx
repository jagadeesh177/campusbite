import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { requirePortalUser } from '@/lib/auth/guards'
import { STAFF_PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/time'
import { PageHeader } from '@/components/ui/misc'
import { AccountsManager } from '@/components/staff/accounts-manager'

export const metadata: Metadata = { title: 'Staff accounts' }
export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const user = await requirePortalUser('STAFF', 'STAFF_ACCOUNTS')
  const staff = await db.user.findMany({ where: { role: 'STAFF' }, include: { staffProfile: true }, orderBy: { name: 'asc' } })
  return (
    <>
      <PageHeader title="Staff accounts" description="College staff who can access this portal. You can’t edit your own permissions." />
      <AccountsManager
        kind="STAFF"
        labelName="Job title"
        catalogue={STAFF_PERMISSIONS}
        accounts={staff.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          label: s.staffProfile?.title ?? null,
          status: s.status,
          permissions: s.staffProfile?.permissions ?? [],
          lastLogin: s.lastLoginAt ? formatDateTime(s.lastLoginAt, env.timezone) : null,
          isSelf: s.id === user.id,
        }))}
      />
    </>
  )
}
