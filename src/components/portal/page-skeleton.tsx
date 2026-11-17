/**
 * Shown instantly while a portal page loads on the server (route-level loading.tsx).
 * Keeps the portal frame in place and lets Next.js prefetch dynamic pages.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label="Loading">
      <div className="h-8 w-48 rounded-lg bg-line/70 motion-safe:animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="h-4 w-1/3 rounded bg-line/70 motion-safe:animate-pulse" />
            <div className="mt-3 h-4 w-2/3 rounded bg-line/50 motion-safe:animate-pulse" />
            <div className="mt-3 h-4 w-1/2 rounded bg-line/50 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
