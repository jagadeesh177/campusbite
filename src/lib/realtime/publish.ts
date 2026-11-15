import 'server-only'
import type { Prisma, PrismaClient } from '@prisma/client'

type Client = PrismaClient | Prisma.TransactionClient

export type RealtimeEventType =
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'PAYMENT_FAILED'
  | 'REFUND_UPDATED'
  | 'MENU_UPDATED'
  | 'KITCHEN_UPDATED'

/**
 * Writes an event row in the same transaction as the change it describes, so
 * subscribers never see an event for a change that rolled back. The SSE
 * endpoint (/api/events) filters rows by audience before sending them.
 */
export async function publishEvent(
  client: Client,
  e: {
    type: RealtimeEventType
    orderId?: string | null
    studentUserId?: string | null
    forCanteen?: boolean
    forStaff?: boolean
    payload?: Prisma.InputJsonObject
  },
) {
  await client.realtimeEvent.create({
    data: {
      type: e.type,
      orderId: e.orderId ?? null,
      studentUserId: e.studentUserId ?? null,
      forCanteen: e.forCanteen ?? false,
      forStaff: e.forStaff ?? false,
      payload: e.payload ?? {},
    },
  })
}

export async function notifyUser(
  client: Client,
  n: { userId: string; orderId?: string | null; type: string; title: string; body: string },
) {
  await client.notification.create({
    data: { userId: n.userId, orderId: n.orderId ?? null, type: n.type, title: n.title, body: n.body },
  })
}
