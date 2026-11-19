import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, Users } from 'lucide-react'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { requirePortalUser } from '@/lib/auth/guards'
import { formatDateTime } from '@/lib/time'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ButtonLink, Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { EmptyState, Notice, PageHeader } from '@/components/ui/misc'
import { UserAccessButton } from '@/components/staff/buttons'

export const metadata: Metadata = { title: 'Users' }
export const dynamic = 'force-dynamic'

const PAGE = 25

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requirePortalUser('STAFF', 'USERS')
  const sp = await searchParams
  const q = (sp.q ?? '').trim().slice(0, 80)
  const page = Math.max(1, Number(sp.page) || 1)
  const where: Prisma.UserWhereInput = {
    role: 'USER',
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
            { userProfile: { phone: { contains: q } } },
          ],
        }
      : {}),
  }
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { userProfile: true, _count: { select: { orders: true } } },
      take: PAGE,
      skip: (page - 1) * PAGE,
    }),
    db.user.count({ where }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <>
      <PageHeader title="User Management" description="Students, teachers and college employees who order food on CampusBite." />
      <Notice tone="info" className="mb-6">
        Revoking access signs the user out and blocks ordering. Their order and payment history is kept.
      </Notice>
      <form className="mb-4 flex gap-2" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search by name, email or mobile</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={q} placeholder="Search by name, email or mobile" className="pl-10" />
        </label>
        <Button type="submit">Search</Button>
      </form>

      <Card>
        {users.length === 0 ? (
          <EmptyState icon={Users} title="No users found" description={q ? 'Try a different search.' : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-subtle">
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-3 py-3 font-medium">Mobile</th>
                  <th className="px-3 py-3 font-medium">Department</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 text-right font-medium">Orders</th>
                  <th className="px-3 py-3 font-medium">Last sign-in</th>
                  <th className="px-6 py-3 text-right font-medium">Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((s) => (
                  <tr key={s.id} className="hover:bg-bg">
                    <td className="px-6 py-3">
                      <Link href={`/staff/users/${s.id}`} className="font-semibold text-ink hover:text-primary">{s.name}</Link>
                      <div className="text-xs text-subtle">{s.email}</div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{s.userProfile?.phone ?? '—'}</td>
                    <td className="px-3 py-3">{s.userProfile?.department ?? '—'}</td>
                    <td className="px-3 py-3">
                      <Badge tone={s.status === 'ACTIVE' ? 'success' : s.status === 'DEACTIVATED' ? 'danger' : 'neutral'} dot>
                        {s.status === 'ACTIVE' ? 'Active' : s.status === 'DEACTIVATED' ? 'Revoked' : 'Not activated'}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{s._count.orders}</td>
                    <td className="px-3 py-3 text-subtle">{s.lastLoginAt ? formatDateTime(s.lastLoginAt, env.timezone) : 'Never'}</td>
                    <td className="px-6 py-3 text-right">
                      {s.status !== 'PENDING_VERIFICATION' && (
                        <UserAccessButton userId={s.id} active={s.status === 'ACTIVE'} name={s.name} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
          {page > 1 && <ButtonLink href={`?q=${encodeURIComponent(q)}&page=${page - 1}`} variant="secondary" size="sm">Previous</ButtonLink>}
          <span className="text-sm text-muted">Page {page} of {pages} · {total} users</span>
          {page < pages && <ButtonLink href={`?q=${encodeURIComponent(q)}&page=${page + 1}`} variant="secondary" size="sm">Next</ButtonLink>}
        </nav>
      )}
    </>
  )
}
