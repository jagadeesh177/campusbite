import type { Metadata } from 'next'
import { ScrollText, Search } from 'lucide-react'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { requirePortalUser } from '@/lib/auth/guards'
import { formatDateTime } from '@/lib/time'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { SectionTabs, settingsTabs } from '@/components/staff/section-tabs'

export const metadata: Metadata = { title: 'Activity log' }
export const dynamic = 'force-dynamic'

const PAGE = 40

function tone(action: string) {
  if (/failed|revoked|deactivated|mismatch|invalid|duplicate/.test(action)) return 'danger' as const
  if (action.startsWith('payment') || action.startsWith('refund')) return 'info' as const
  if (action.startsWith('account') || action.startsWith('auth')) return 'violet' as const
  if (action.startsWith('menu') || action.startsWith('kitchen')) return 'accent' as const
  return 'neutral' as const
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requirePortalUser('STAFF', 'AUDIT')
  const sp = await searchParams
  const q = (sp.q ?? '').trim().slice(0, 60)
  const page = Math.max(1, Number(sp.page) || 1)
  const where: Prisma.AuditLogWhereInput = q
    ? { OR: [{ action: { contains: q, mode: 'insensitive' } }, { entityType: { contains: q, mode: 'insensitive' } }, { actor: { name: { contains: q, mode: 'insensitive' } } }] }
    : {}
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: PAGE, skip: (page - 1) * PAGE, include: { actor: { select: { name: true, email: true } } } }),
    db.auditLog.count({ where }),
  ])
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <>
      <PageHeader title="Settings" description="Activity log: who changed accounts, menus, orders and payments." />
      <SectionTabs tabs={settingsTabs(user.permissions)} active="/staff/audit" />
      <form className="mb-4 flex gap-2" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Filter audit log</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
          <Input name="q" defaultValue={q} placeholder="Filter by action (e.g. refund, account, menu) or person" className="pl-10" />
        </label>
        <Button type="submit">Filter</Button>
      </form>
      <Card>
        {logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="No entries" />
        ) : (
          <ul className="divide-y divide-line">
            {logs.map((l) => (
              <li key={l.id} className="grid gap-2 px-6 py-4 sm:grid-cols-[180px_1fr]">
                <div className="text-xs text-subtle">{formatDateTime(l.createdAt, env.timezone)}{l.ip ? <div className="font-mono">{l.ip}</div> : null}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone(l.action)}>{l.action}</Badge>
                    <span className="text-sm">
                      by <strong>{l.actor?.name ?? 'System'}</strong>
                      <span className="text-subtle"> · {l.actorRole?.toLowerCase()}</span>
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-subtle">{l.entityType}{l.entityId ? ` · ${l.entityId}` : ''}</div>
                  {l.metadata && (
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-bg px-3 py-2 text-xs text-ink/80">{JSON.stringify(l.metadata)}</pre>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
          {page > 1 && <ButtonLink href={`?q=${encodeURIComponent(q)}&page=${page - 1}`} variant="secondary" size="sm">Newer</ButtonLink>}
          <span className="text-sm text-muted">Page {page} of {pages}</span>
          {page < pages && <ButtonLink href={`?q=${encodeURIComponent(q)}&page=${page + 1}`} variant="secondary" size="sm">Older</ButtonLink>}
        </nav>
      )}
    </>
  )
}
