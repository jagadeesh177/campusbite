import type { Metadata } from 'next'
import { ProsePage } from '@/components/site/prose-page'
import { PHOTO_CREDITS } from '@/lib/photo-credits'

export const metadata: Metadata = { title: 'Photo credits' }

export default function CreditsPage() {
  return (
    <ProsePage title="Photo credits" intro="Food photos are from Wikimedia Commons and used under their free licences.">
      <ul className="space-y-3">
        {PHOTO_CREDITS.map((c) => (
          <li key={c.slug} className="!ml-0 !list-none rounded-xl border border-line bg-surface p-4 text-sm">
            <a href={c.source} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
              {c.title}
            </a>
            <div className="text-muted">
              by {c.author} ·{' '}
              {c.licenseUrl ? (
                <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">{c.license}</a>
              ) : (
                c.license
              )}
            </div>
          </li>
        ))}
      </ul>
    </ProsePage>
  )
}
