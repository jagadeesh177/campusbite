'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export interface LiveEvent {
  id: string
  type: string
  orderId: string | null
  payload: Record<string, unknown>
}

/**
 * Subscribes to /api/events (Server-Sent Events). The server only streams
 * events the signed-in user may see. On any event the current page's server
 * data is refreshed. If SSE keeps failing (proxies, old browsers) it falls
 * back to polling the same endpoint every 5 seconds.
 */
export function LiveUpdates({
  onEvent,
  showIndicator = true,
}: {
  onEvent?: (e: LiveEvent) => void
  showIndicator?: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'connecting' | 'live' | 'polling'>('connecting')
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let es: EventSource | null = null
    let failures = 0
    let lastId: string | null = null
    let closed = false

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => router.refresh(), 350)
    }
    const handle = (e: LiveEvent) => {
      lastId = e.id
      handler.current?.(e)
      scheduleRefresh()
    }

    const startPolling = () => {
      setMode('polling')
      const poll = async () => {
        try {
          const res = await fetch(`/api/events?mode=poll${lastId ? `&since=${lastId}` : ''}`, { cache: 'no-store' })
          if (!res.ok) return
          const data: { events: LiveEvent[]; lastId: string | null } = await res.json()
          if (!lastId) {
            lastId = data.lastId
            return
          }
          data.events.forEach(handle)
          if (data.lastId) lastId = data.lastId
        } catch {
          /* offline — try again next tick */
        }
      }
      void poll()
      pollTimer = setInterval(poll, 5000)
    }

    if (typeof EventSource === 'undefined') {
      startPolling()
    } else {
      es = new EventSource('/api/events')
      es.onopen = () => {
        failures = 0
        setMode('live')
      }
      es.onmessage = (msg) => {
        try {
          handle(JSON.parse(msg.data))
        } catch {
          /* ignore malformed */
        }
      }
      es.onerror = () => {
        failures++
        // EventSource reconnects by itself (server closes every ~25s by design)
        if (failures >= 4 && !closed) {
          es?.close()
          startPolling()
        }
      }
    }

    return () => {
      closed = true
      es?.close()
      if (pollTimer) clearInterval(pollTimer)
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  }, [router])

  if (!showIndicator) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        mode === 'live' ? 'border-accent/30 bg-accent-soft text-accent-ink' : 'border-line bg-surface text-subtle',
      )}
      title={mode === 'live' ? 'Receiving live updates' : mode === 'polling' ? 'Live connection unavailable — refreshing every 5 seconds' : 'Connecting…'}
    >
      <span className={cn('h-2 w-2 rounded-full', mode === 'live' ? 'cb-pulse bg-accent' : 'bg-muted')} aria-hidden />
      {mode === 'live' ? 'Live' : mode === 'polling' ? 'Auto-refresh' : 'Connecting'}
    </span>
  )
}
