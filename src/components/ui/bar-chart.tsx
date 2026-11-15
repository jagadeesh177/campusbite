import { cn } from '@/lib/cn'

/** Dependency-free, accessible bar chart (server-rendered SVG + data table for screen readers). */
export function BarChart({
  data,
  format,
  height = 200,
  highlightLast = true,
  label,
}: {
  data: { label: string; value: number; sublabel?: string }[]
  format: (v: number) => string
  height?: number
  highlightLast?: boolean
  label: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const showEvery = data.length > 16 ? Math.ceil(data.length / 8) : 1
  return (
    <figure>
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height }} aria-hidden>
        {data.map((d, i) => {
          const h = Math.max(2, Math.round((d.value / max) * (height - 28)))
          const last = highlightLast && i === data.length - 1
          return (
            <div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
              <span className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full rounded-lg bg-primary px-2 py-1 text-xs font-semibold whitespace-nowrap text-white shadow group-hover:block">
                {d.sublabel ?? d.label}: {format(d.value)}
              </span>
              <div
                className={cn('w-full rounded-t-md transition-colors', last ? 'bg-primary' : 'bg-accent/70 group-hover:bg-accent')}
                style={{ height: h }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-2" aria-hidden>
        {data.map((d, i) => (
          <div key={i} className="min-w-0 flex-1 truncate text-center text-[11px] text-subtle">
            {i % showEvery === 0 || i === data.length - 1 ? d.label : ''}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th>{d.sublabel ?? d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
