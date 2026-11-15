import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const STREAM_MS = 25_000 // serverless-friendly: client reconnects automatically
const TICK_MS = 2_000

function parseId(v: string | null): bigint | null {
  if (!v || !/^\d{1,19}$/.test(v)) return null
  return BigInt(v)
}

/**
 * Realtime feed. Authorization is enforced in the WHERE clause: students only
 * receive events addressed to them; canteen/staff only receive events
 * flagged for their role.
 */
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const audience: Prisma.RealtimeEventWhereInput =
    user.role === 'STUDENT' ? { studentUserId: user.id } : user.role === 'CANTEEN' ? { forCanteen: true } : { forStaff: true }

  const url = new URL(req.url)
  let since = parseId(req.headers.get('last-event-id')) ?? parseId(url.searchParams.get('since'))
  if (since === null) {
    const latest = await db.realtimeEvent.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
    since = latest?.id ?? BigInt(0)
  }

  const fetchEvents = async (after: bigint) => {
    const rows = await db.realtimeEvent.findMany({
      where: { ...audience, id: { gt: after } },
      orderBy: { id: 'asc' },
      take: 50,
    })
    return rows.map((r) => ({ id: r.id.toString(), type: r.type, orderId: r.orderId, payload: r.payload }))
  }

  // Polling fallback
  if (url.searchParams.get('mode') === 'poll') {
    const events = url.searchParams.has('since') ? await fetchEvents(since) : []
    return Response.json(
      { events, lastId: events.at(-1)?.id ?? since.toString() },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now()
      let cursor = since!
      let lastBeat = Date.now()
      const send = (s: string) => controller.enqueue(encoder.encode(s))
      send('retry: 2000\n\n')
      try {
        while (!req.signal.aborted && Date.now() - started < STREAM_MS) {
          const events = await fetchEvents(cursor)
          for (const e of events) {
            send(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`)
            cursor = BigInt(e.id)
          }
          if (Date.now() - lastBeat > 15_000) {
            send(': keep-alive\n\n')
            lastBeat = Date.now()
          }
          await new Promise((r) => setTimeout(r, TICK_MS))
        }
      } catch {
        /* client went away or DB hiccup — EventSource will reconnect */
      } finally {
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
