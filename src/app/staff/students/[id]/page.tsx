import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { requirePortalUser } from '@/lib/auth/guards'
import { formatINR, rupeesToPaise } from '@/lib/money'
import { formatDateTime } from '@/lib/time'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge, OrderStatusBadge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/misc'
import { StudentAccessButton } from '@/components/staff/buttons'

export const metadata: Metadata = { title: 'Student' }
export const dynamic = 'force-dynamic'

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalUser('STAFF', 'STUDENTS')
  const { id } = await params
  const student = await db.user.findFirst({
    where: { id, role: 'STUDENT' },
    include: {
      studentProfile: true,
      orders: { orderBy: { createdAt: 'desc' }, take: 50, include: { items: true } },
    },
  })
  if (!student) notFound()
  const p = student.studentProfile

  return (
    <>
      <Link href="/staff/students" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Students
      </Link>
      <PageHeader
        title={student.name}
        description={student.email}
        action={student.status !== 'PENDING_VERIFICATION' && <StudentAccessButton userId={student.id} active={student.status === 'ACTIVE'} name={student.name} />}
      />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
        <Card>
          <CardBody>
            <dl className="space-y-3 text-sm">
              {[
                ['Student ID', p?.externalStudentId ?? '—'],
                ['Department', p?.department ?? '—'],
                ['Programme', p?.programme ?? '—'],
                ['Year', p?.yearOfStudy ?? '—'],
                ['Verified via', p?.integrationSource ?? '—'],
                ['Enrollment checked', p?.enrollmentCheckedAt ? formatDateTime(p.enrollmentCheckedAt, env.timezone) : '—'],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={p?.enrollmentStatus === 'ENROLLED' ? 'success' : 'warning'} dot>{p?.enrollmentStatus ?? 'UNKNOWN'}</Badge>
              <Badge tone={student.status === 'ACTIVE' ? 'success' : 'danger'} dot>{student.status === 'ACTIVE' ? 'Access active' : 'Access revoked'}</Badge>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Order history" description={`${student.orders.length} most recent`} />
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {student.orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{o.orderNumber}</span>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <div className="truncate text-sm text-muted">{o.items.map((i) => `${i.nameSnapshot} ×${i.quantity}`).join(', ')}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold tabular-nums">{formatINR(rupeesToPaise(o.total))}</div>
                  <div className="text-xs text-subtle">{formatDateTime(o.createdAt, env.timezone)}</div>
                </div>
              </li>
            ))}
            {student.orders.length === 0 && <li className="px-6 py-8 text-center text-sm text-muted">No orders yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  )
}
