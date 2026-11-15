import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Mail } from 'lucide-react'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { Card } from '@/components/ui/card'
import { EmptyState, Notice, PageHeader } from '@/components/ui/misc'
import { formatDateTime } from '@/lib/time'

export const metadata: Metadata = { title: 'Dev mailbox', robots: { index: false } }
export const dynamic = 'force-dynamic'

/** DEVELOPMENT ONLY. Disabled unless DEV_TOOLS_ENABLED=true and the dev outbox is in use. */
export default async function DevMailboxPage() {
  if (!env.devToolsEnabled || env.emailProvider !== 'dev-outbox') notFound()
  const messages = await db.devMailMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title="Dev mailbox" description="Emails the app would have sent. Development only — disable DEV_TOOLS_ENABLED in production." />
      <Notice tone="warning" className="mb-6">
        This page exists only for local development and demos. It is hidden when DEV_TOOLS_ENABLED is false.
      </Notice>
      <Card>
        {messages.length === 0 ? (
          <EmptyState icon={Mail} title="No emails yet" description="Activation codes will appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {messages.map((m) => (
              <li key={m.id} className="p-5">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-semibold text-ink">{m.subject}</span>
                  <span className="text-subtle">{formatDateTime(m.createdAt, env.timezone)}</span>
                </div>
                <div className="mt-0.5 text-sm text-muted">To: {m.to}</div>
                <pre className="mt-3 whitespace-pre-wrap break-all rounded-xl bg-bg p-3 font-sans text-sm text-ink">
                  {m.body.split(/(https?:\/\/\S+)/g).map((part, i) =>
                    /^https?:\/\//.test(part) ? (
                      <a key={i} href={part} className="font-semibold text-primary underline">{part}</a>
                    ) : (
                      part
                    ),
                  )}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
