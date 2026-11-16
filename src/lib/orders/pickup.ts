import 'server-only'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import { rupeesToPaise } from '@/lib/money'
import type { OrderStatusValue } from '@/lib/order-status'
import type { Actor } from '@/lib/auth/guards'
import { parsePickupInput } from './codes'
import { recordStatusChange } from './events'

export interface PickupPreview {
  orderId: string
  orderNumber: string
  token: string
  userName: string
  studentId: string | null
  status: OrderStatusValue
  totalPaise: number
  items: { name: string; quantity: number }[]
  canCollect: boolean
  problem: string | null
}

function assertCanteenOrders(actor: Actor) {
  if (actor.role !== 'CANTEEN' || !actor.permissions.includes('ORDERS')) {
    throw new AppError('FORBIDDEN', 'You do not have permission to verify pickups.')
  }
}

async function loadByInput(raw: string) {
  const parsed = parsePickupInput(raw)
  if (!parsed) throw new AppError('VALIDATION', 'That is not a valid pickup token or QR code.')
  const pickup = await db.pickupToken.findUnique({
    where: { token: parsed.token },
    include: {
      order: {
        include: {
          items: true,
          payments: { where: { status: 'SUCCEEDED' }, take: 1 },
          user: { include: { userProfile: true } },
        },
      },
    },
  })
  if (!pickup) throw new AppError('NOT_FOUND', 'No order matches this token.')
  if (parsed.orderNumber && parsed.orderNumber !== pickup.order.orderNumber) {
    throw new AppError('VALIDATION', 'This QR code does not match its order. Ask the user to show the code again.')
  }
  return pickup
}

function problemFor(p: Awaited<ReturnType<typeof loadByInput>>): string | null {
  if (p.usedAt || p.order.status === 'COLLECTED') return 'Already collected — do not hand over again.'
  if (!p.order.payments.length) return 'Payment is not verified for this order.'
  if (p.order.status !== 'READY') return `Order is not ready yet (status: ${p.order.status.replace('_', ' ').toLowerCase()}).`
  return null
}

/** Step 1: show the canteen who the order belongs to before handing it over. */
export async function lookupPickup(actor: Actor, raw: string): Promise<PickupPreview> {
  assertCanteenOrders(actor)
  const p = await loadByInput(raw)
  const problem = problemFor(p)
  return {
    orderId: p.order.id,
    orderNumber: p.order.orderNumber,
    token: p.token,
    userName: p.order.user.name,
    studentId: p.order.user.userProfile?.externalStudentId ?? null,
    status: p.order.status,
    totalPaise: rupeesToPaise(p.order.total),
    items: p.order.items.map((i) => ({ name: i.nameSnapshot, quantity: i.quantity })),
    canCollect: problem === null,
    problem,
  }
}

/** Step 2: hand over. Token is single-use; concurrent scans can't both succeed. */
export async function completePickup(actor: Actor, raw: string): Promise<{ orderNumber: string }> {
  assertCanteenOrders(actor)
  const p = await loadByInput(raw)
  const problem = problemFor(p)
  if (problem) throw new AppError('CONFLICT', problem)

  await db.$transaction(async (tx) => {
    const used = await tx.pickupToken.updateMany({
      where: { id: p.id, usedAt: null },
      data: { usedAt: new Date(), verifiedById: actor.userId },
    })
    const collected = await tx.order.updateMany({
      where: { id: p.orderId, status: 'READY' },
      data: { status: 'COLLECTED', collectedAt: new Date() },
    })
    if (!used.count || !collected.count) {
      throw new AppError('CONFLICT', 'Already collected — do not hand over again.')
    }
    await recordStatusChange(tx, {
      order: p.order,
      from: 'READY',
      to: 'COLLECTED',
      actorKind: 'CANTEEN',
      actorUserId: actor.userId,
      note: 'Pickup token verified',
    })
    await audit(
      { actor, action: 'order.collected', entityType: 'Order', entityId: p.orderId, metadata: { orderNumber: p.order.orderNumber } },
      tx,
    )
  })
  return { orderNumber: p.order.orderNumber }
}
