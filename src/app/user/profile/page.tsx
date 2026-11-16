import type { Metadata } from 'next'
import { GraduationCap, Lock } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePortalUser } from '@/lib/auth/guards'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/misc'
import { ProfileForm } from './profile-form'
import { DeleteAccount } from './delete-account'
import { AccountSecurity } from './account-security'

export const metadata: Metadata = { title: 'User Profile' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const user = await requirePortalUser('USER')
  const profile = await db.userProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const selfRegistered = profile.integrationSource === 'supabase'
  const fields = [
    ['Name', user.name],
    ['Email', user.email],
    ...(profile.externalStudentId ? [['Student ID', profile.externalStudentId]] : []),
    ['Department', profile.department ?? '—'],
    ...(selfRegistered ? [] : [['Programme', profile.programme ?? '—'], ['Year', profile.yearOfStudy ? `Year ${profile.yearOfStudy}` : '—']]),
  ]

  return (
    <>
      <PageHeader title="User Profile" />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><GraduationCap className="h-5 w-5 text-accent" /> Account details</span>}
            description="Edit your name and details on the right. Your email can’t be changed."
            action={<Badge tone="success" dot>Email verified</Badge>}
          />
          <CardBody>
            <dl className="divide-y divide-line">
              {fields.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3 text-[15px] first:pt-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Edit profile" description="Your name is shown to the canteen on your orders." />
            <CardBody>
              <ProfileForm
                defaults={{
                  fullName: user.name,
                  department: profile.department ?? '',
                  phone: profile.phone ?? '',
                  dietaryPreference: profile.dietaryPreference ?? 'NO_PREFERENCE',
                  orderUpdatesEnabled: profile.orderUpdatesEnabled,
                }}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title={<span className="inline-flex items-center gap-2"><Lock className="h-4.5 w-4.5 text-accent" /> Account Security</span>}
              description="Change the password you sign in with."
            />
            <CardBody>
              <AccountSecurity />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <DeleteAccount />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
