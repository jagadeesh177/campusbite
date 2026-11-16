'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Pause, Play } from 'lucide-react'
import { setAcceptingOrdersAction } from '@/app/actions/canteen'
import { cn } from '@/lib/cn'

/** One big switch: pause or resume new online orders. */
export function AcceptingSwitch({ accepting }: { accepting: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={accepting}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await setAcceptingOrdersAction(!accepting)
            if (!r.ok) setError(r.error)
            router.refresh()
          })
        }
        className={cn(
          'inline-flex h-12 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold shadow-sm transition-colors disabled:opacity-60',
          accepting ? 'bg-success-soft text-success hover:bg-success-soft/70' : 'bg-warning-soft text-warning-ink hover:bg-warning-soft/70',
        )}
      >
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : accepting ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        {accepting ? 'Taking orders · Pause' : 'Orders paused · Resume'}
      </button>
      {error && <span className="text-sm text-danger-ink">{error}</span>}
    </div>
  )
}
