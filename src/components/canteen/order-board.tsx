'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { BellRing, BellOff, CheckCircle2, ChefHat, Clock, Inbox, Loader2, PackageCheck, ShieldAlert, ShieldCheck, ThumbsUp, XCircle } from 'lucide-react'
import { changeStatusAction, completePickupAction } from '@/app/actions/canteen'
import { Button } from '@/components/ui/button'
import { OrderStatusBadge } from '@/components/ui/badge'
import { ConfirmDialog, Flash, useFlash } from '@/components/ui/client'
import { LiveUpdates, type LiveEvent } from '@/components/portal/live-updates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/cn'
import type { OrderStatusValue } from '@/lib/order-status'
import type { BoardOrder } from '@/lib/queries/canteen'

const COLUMNS: { key: string; title: string; statuses: OrderStatusValue[]; Icon: typeof Inbox; accent: string }[] = [
  { key: 'new', title: 'New orders', statuses: ['CONFIRMED'], Icon: Inbox, accent: 'bg-info' },
  { key: 'prep', title: 'Preparing', statuses: ['ACCEPTED', 'PREPARING'], Icon: ChefHat, accent: 'bg-accent' },
  { key: 'ready', title: 'Ready for pickup', statuses: ['READY'], Icon: PackageCheck, accent: 'bg-success' },
  { key: 'done', title: 'Completed', statuses: ['COLLECTED', 'REFUND_PENDING', 'REFUNDED'], Icon: CheckCircle2, accent: 'bg-muted' },
]

function minutesAgo(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  return m < 1 ? 'just now' : `${m} min ago`
}

function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[0, 0.18].forEach((t, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = i ? 1046 : 784
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.4)
    })
  } catch {
    /* audio not available */
  }
}

export function OrderBoard({ orders, tz }: { orders: BoardOrder[]; tz: string }) {
  const router = useRouter()
  const [tab, setTab] = useState('new')
  const [sound, setSound] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [flash, setFlash] = useFlash()
  const soundRef = useRef(sound)
  soundRef.current = sound

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const onEvent = (e: LiveEvent) => {
    if (e.type === 'ORDER_CREATED' && soundRef.current) chime()
  }

  const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true })

  async function act(order: BoardOrder, to: OrderStatusValue, reason?: string) {
    const r = await changeStatusAction(order.id, to, reason)
    if (r.ok) {
      const refundNote = r.data.refund === 'processed' ? ' Refund sent.' : r.data.refund === 'failed' ? ' Refund needs staff attention.' : ''
      setFlash({ tone: 'success', text: `${order.orderNumber} updated.${refundNote}` })
    } else setFlash({ tone: 'danger', text: r.error })
    router.refresh()
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 lg:hidden" role="tablist" aria-label="Order columns">
          {COLUMNS.map((c) => {
            const count = orders.filter((o) => c.statuses.includes(o.status)).length
            return (
              <button
                key={c.key}
                role="tab"
                aria-selected={tab === c.key}
                onClick={() => setTab(c.key)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-sm font-semibold',
                  tab === c.key ? 'border-primary bg-primary text-white' : 'border-line bg-surface text-ink',
                )}
              >
                {c.title.split(' ')[0]} <span className="tabular-nums opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LiveUpdates onEvent={onEvent} showIndicator={false} />
          <Button
            variant={sound ? 'soft' : 'secondary'}
            size="sm"
            onClick={() => {
              setSound((s) => !s)
              if (!sound) chime()
            }}
            aria-pressed={sound}
          >
            {sound ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {sound ? 'Sound on' : 'Sound off'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => col.statuses.includes(o.status))
          if (col.key === 'done') list.reverse()
          return (
            <section key={col.key} className={cn('min-w-0', tab !== col.key && 'hidden lg:block')} aria-label={col.title}>
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={cn('h-2.5 w-2.5 rounded-full', col.accent)} aria-hidden />
                <h2 className="font-semibold text-ink">{col.title}</h2>
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-subtle shadow-sm tabular-nums">{list.length}</span>
              </div>
              <div className="space-y-3">
                {list.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-subtle">Nothing here</div>
                )}
                {list.map((o) => (
                  <OrderCard key={o.id} order={o} now={now} timeFmt={timeFmt} onAct={act} onCollected={(n) => setFlash({ tone: 'success', text: `${n} handed over.` })} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <Flash flash={flash} />
    </div>
  )
}

function OrderCard({
  order: o,
  now,
  timeFmt,
  onAct,
  onCollected,
}: {
  order: BoardOrder
  now: number
  timeFmt: Intl.DateTimeFormat
  onAct: (o: BoardOrder, to: OrderStatusValue, reason?: string) => Promise<void>
  onCollected: (orderNumber: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const isNew = o.status === 'CONFIRMED' && now - new Date(o.createdAt).getTime() < 2 * 60_000
  const run = async (to: OrderStatusValue) => {
    setBusy(true)
    await onAct(o, to)
    setBusy(false)
  }
  const done = ['COLLECTED', 'REFUND_PENDING', 'REFUNDED'].includes(o.status)

  return (
    <article
      className={cn(
        'rounded-2xl border bg-surface p-4 shadow-card',
        isNew ? 'border-info/40 ring-4 ring-info/10' : o.status === 'READY' ? 'border-success/40' : 'border-line',
        done && 'opacity-80',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-bold whitespace-nowrap text-ink">{o.orderNumber}</div>
          <div className="truncate text-[15px] font-semibold text-ink">{o.userName}</div>
          {o.studentId && <div className="text-xs text-subtle">{o.studentId}</div>}
        </div>
        <div className="flex flex-col items-end gap-1">
          {isNew ? <span className="rounded-full bg-info px-2 py-0.5 text-[11px] font-bold text-white">NEW</span> : <OrderStatusBadge status={o.status} />}
          <span className="text-xs text-subtle">{minutesAgo(o.createdAt, now)}</span>
        </div>
      </div>

      <ul className="mt-3 space-y-1 rounded-xl bg-bg p-3">
        {o.items.map((i, idx) => (
          <li key={idx} className="flex justify-between gap-2 text-[15px]">
            <span className="font-medium text-ink">{i.name}</span>
            <span className="font-bold text-primary tabular-nums">×{i.quantity}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold tabular-nums">{formatINR(o.totalPaise)}</span>
        {o.paymentVerified ? (
          <span className="inline-flex items-center gap-1 font-medium text-success"><ShieldCheck className="h-4 w-4" /> Paid</span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-danger-ink"><ShieldAlert className="h-4 w-4" /> Not paid</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-subtle">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {o.pickupSlotStart ? `Slot ${timeFmt.format(new Date(o.pickupSlotStart))}` : `Placed ${timeFmt.format(new Date(o.createdAt))}`}
        </span>
        {o.pickupToken && <span className="font-mono font-bold tracking-widest text-primary">{o.pickupToken}</span>}
      </div>
      {o.cancelReason && done && <p className="mt-2 text-xs text-danger-ink">{o.cancelReason}</p>}

      {!done && (
        <div className="mt-4 grid gap-2">
          {o.status === 'CONFIRMED' && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button size="lg" onClick={() => run('ACCEPTED')} disabled={busy}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ThumbsUp className="h-5 w-5" />} Accept order
              </Button>
              <RejectButton order={o} onAct={onAct} />
            </div>
          )}
          {o.status === 'ACCEPTED' && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button size="lg" onClick={() => run('PREPARING')} disabled={busy}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChefHat className="h-5 w-5" />} Start preparing
              </Button>
              <RejectButton order={o} onAct={onAct} />
            </div>
          )}
          {o.status === 'PREPARING' && (
            <Button size="lg" variant="success" onClick={() => run('READY')} disabled={busy}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageCheck className="h-5 w-5" />} Mark ready
            </Button>
          )}
          {o.status === 'READY' && <CollectButton order={o} onCollected={onCollected} />}
        </div>
      )}
    </article>
  )
}

function RejectButton({ order, onAct }: { order: BoardOrder; onAct: (o: BoardOrder, to: OrderStatusValue, reason?: string) => Promise<void> }) {
  return (
    <ConfirmDialog
      trigger={<XCircle className="h-5 w-5" />}
      triggerVariant="danger-ghost"
      triggerSize="icon-lg"
      title={`Reject ${order.orderNumber}?`}
      description={`${order.userName} has already paid ${formatINR(order.totalPaise)}. A full refund will be started automatically.`}
      requireReason
      reasonLabel="Reason (shown to the user)"
      reasonPlaceholder="e.g. Samosas sold out"
      confirmLabel="Reject & refund"
      confirmVariant="danger"
      onConfirm={(reason) => onAct(order, 'REFUND_PENDING', reason)}
    />
  )
}

function CollectButton({ order, onCollected }: { order: BoardOrder; onCollected: (n: string) => void }) {
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <Button size="lg" onClick={() => { setToken(''); setError(null); ref.current?.showModal() }}>
        <CheckCircle2 className="h-5 w-5 text-accent" /> Mark collected
      </Button>
      <dialog ref={ref} className="m-auto w-[min(92vw,420px)] rounded-2xl border border-line bg-surface p-0 shadow-lift">
        <form
          className="p-6"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            // Bind the token to THIS order so the wrong bag can't be handed over
            const r = await completePickupAction(`CB1:${order.orderNumber}:${token.trim().toUpperCase()}`)
            setBusy(false)
            if (!r.ok) return setError(r.error)
            ref.current?.close()
            onCollected(order.orderNumber)
            router.refresh()
          }}
        >
          <h2 className="text-lg font-semibold">Hand over {order.orderNumber}</h2>
          <p className="mt-1 text-sm text-muted">Ask {order.userName} for their 6-character pickup code and type it below.</p>
          <input
            autoFocus
            value={token}
            onChange={(e) => setToken(e.target.value)}
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="Pickup code"
            className="mt-4 h-14 w-full rounded-xl border border-line text-center font-mono text-2xl font-bold tracking-[0.4em] uppercase focus:border-accent focus:shadow-[var(--shadow-focus)] focus:outline-none"
          />
          {error && <p className="mt-3 text-sm font-medium text-danger-ink" role="alert">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => ref.current?.close()}>Cancel</Button>
            <Button type="submit" disabled={busy || token.trim().length < 6}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verify & hand over
            </Button>
          </div>
        </form>
      </dialog>
    </>
  )
}
