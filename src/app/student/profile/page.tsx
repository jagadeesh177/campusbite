import type { Metadata } from 'next'
import { GraduationCap, Lock } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePortalUser } from '@/lib/auth/guards'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/misc'
import { ProfileForm } from './profile-form'

export const metadata: Metadata = { title: 'Profile' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const user = await requirePortalUser('STUDENT')
  const profile = await db.studentProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const fields = [
    ['Name', user.name],
    ['College email', user.email],
    ['Student ID', profile.externalStudentId],
    ['Department', profile.department ?? '—'],
    ['Programme', profile.programme ?? '—'],
    ['Year', profile.yearOfStudy ? `Year ${profile.yearOfStudy}` : '—'],
  ]

  return (
    <>
      <PageHeader title="Profile" />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><GraduationCap className="h-5 w-5 text-accent" /> College details</span>}
            description="From college records — contact the college office to correct these."
            action={<Badge tone={profile.enrollmentStatus === 'ENROLLED' ? 'success' : 'warning'} dot>{profile.enrollmentStatus === 'ENROLLED' ? 'Enrolled' : profile.enrollmentStatus}</Badge>}
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
            <CardHeader title="Preferences" description="Only you can change these." />
            <CardBody>
              <ProfileForm
                defaults={{
                  phone: profile.phone ?? '',
                  dietaryPreference: profile.dietaryPreference ?? 'NO_PREFERENCE',
                  orderUpdatesEnabled: profile.orderUpdatesEnabled,
                }}
              />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium"><Lock className="h-4.5 w-4.5 text-accent" /> Password</span>
              <ButtonLink href="/account/password" variant="secondary" size="sm">Change password</ButtonLink>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
