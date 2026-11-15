import type { ReactNode } from 'react'

export function ProsePage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold text-primary sm:text-4xl">{title}</h1>
      {intro && <p className="mt-3 text-lg text-muted">{intro}</p>}
      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-ink [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:mt-1 [&_p]:text-ink/85">
        {children}
      </div>
    </div>
  )
}
