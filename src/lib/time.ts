// Timezone-aware helpers (pure). The canteen runs on campus local time
// (APP_TIMEZONE, default Asia/Kolkata) regardless of server timezone.

export function zonedMinutesOfDay(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

export function parseHHMM(value: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!m) throw new Error(`Invalid time "${value}", expected HH:mm`)
  return Number(m[1]) * 60 + Number(m[2])
}

export function isOpenAt(date: Date, tz: string, opening: string, closing: string): boolean {
  const now = zonedMinutesOfDay(date, tz)
  return now >= parseHHMM(opening) && now < parseHHMM(closing)
}

/** Start of the current day in `tz`, as an absolute Date. */
export function startOfZonedDay(date: Date, tz: string): Date {
  const minutes = zonedMinutesOfDay(date, tz)
  const ms = date.getUTCSeconds() * 1000 + date.getUTCMilliseconds()
  return new Date(date.getTime() - minutes * 60_000 - ms)
}

export interface SlotOptions {
  now: Date
  tz: string
  opening: string
  closing: string
  slotMinutes: number
  /** Minimum minutes from now before the earliest slot (prep time). */
  leadMinutes: number
  max?: number
}

/** Upcoming pickup slot start times for today, aligned to the slot grid. */
export function pickupSlots(o: SlotOptions): Date[] {
  const nowMin = zonedMinutesOfDay(o.now, o.tz)
  const open = parseHHMM(o.opening)
  const close = parseHHMM(o.closing)
  const step = Math.max(5, o.slotMinutes)
  let start = Math.ceil((nowMin + o.leadMinutes) / step) * step
  if (start < open) start = Math.ceil(open / step) * step
  const base = o.now.getTime() - (o.now.getUTCSeconds() * 1000 + o.now.getUTCMilliseconds())
  const slots: Date[] = []
  while (start < close && slots.length < (o.max ?? 16)) {
    slots.push(new Date(base + (start - nowMin) * 60_000))
    start += step
  }
  return slots
}

export function formatTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatDateTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}
