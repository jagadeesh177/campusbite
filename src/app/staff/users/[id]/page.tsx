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
import { UserAccessButton } from '@/components/staff/buttons'

export const metadata: Metadata = { title: 'User Account' }
export const dynamic = 'force-dynamic'

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalUser('STAFF', 'USERS')
  const { id } = await params
  const user = await db.user.findFirst({
    where: { id, role: 'USER' },
    include: {
      userProfile: true,
      orders: { orderBy: { createdAt: 'desc' }, take: 50, include: { items: true } },
    },
  })
  if (!user) notFound()
  const p = user.userProfile

  return (
    <>
      <Link href="/staff/users" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Users
      </Link>
      <PageHeader
        title={user.name}
        description={user.email}
        action={user.status !== 'PENDING_VERIFICATION' && <UserAccessButton userId={user.id} active={user.status === 'ACTIVE'} name={user.name} />}
      />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
        <Card>
          <CardBody>
            <dl className="space-y-3 text-sm">
              {[
                ['Student ID', p?.externalStudentId ?? '—'],
                ['Mobile', p?.phone ?? '—'],
                ['Department', p?.department ?? '—'],
                ['Account type', p?.integrationSource === 'supabase' ? 'Self-registered (Supabase)' : 'Demo / legacy'],
                ['Email verified', user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt, env.timezone) : 'Not yet'],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={user.status === 'PENDING_VERIFICATION' ? 'warning' : 'success'} dot>{user.status === 'PENDING_VERIFICATION' ? 'Awaiting email verification' : 'Email verified'}</Badge>
              <Badge tone={user.status === 'ACTIVE' ? 'success' : 'danger'} dot>{user.status === 'ACTIVE' ? 'Access active' : 'Access revoked'}</Badge>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Order history" description={`${user.orders.length} most recent`} />
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {user.orders.map((o) => (
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
            {user.orders.length === 0 && <li className="px-6 py-8 text-center text-sm text-muted">No orders yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  )
}
