import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { requirePortalUser } from '@/lib/auth/guards'
import { STAFF_PERMISSIONS } from '@/lib/auth/permissions'
import { formatDateTime } from '@/lib/time'
import { PageHeader } from '@/components/ui/misc'
import { SectionTabs, accountTabs } from '@/components/staff/section-tabs'
import { AccountsManager } from '@/components/staff/accounts-manager'

export const metadata: Metadata = { title: 'Staff accounts' }
export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const user = await requirePortalUser('STAFF', 'STAFF_ACCOUNTS')
  const staff = await db.user.findMany({ where: { role: 'STAFF' }, include: { staffProfile: true }, orderBy: { name: 'asc' } })
  return (
    <>
      <PageHeader title="Accounts" description="Who can use the staff portal. You can’t edit your own permissions." />
      <SectionTabs tabs={accountTabs(user.permissions)} active="/staff/team" />
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
