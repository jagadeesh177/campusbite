import 'server-only'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import { ORDER_STATUS_LABEL, ORDER_STATUSES, type OrderStatusValue } from '@/lib/order-status'
import type { Actor } from '@/lib/auth/guards'
import { processRefund } from '@/lib/payments/refunds'
import { recordStatusChange } from './events'
import { canTransition, type ActorKind } from './state-machine'

export const changeStatusSchema = z.object({
  orderId: z.string().min(1).max(40),
  to: z.enum(ORDER_STATUSES),
  reason: z.string().trim().max(200).optional(),
})

const TIMESTAMP_FIELD: Partial<Record<OrderStatusValue, 'acceptedAt' | 'readyAt' | 'cancelledAt'>> = {
  ACCEPTED: 'acceptedAt',
  READY: 'readyAt',
  CANCELLED: 'cancelledAt',
  REFUND_PENDING: 'cancelledAt',
}

function actorKindFor(actor: Actor): ActorKind {
  return actor.role
}

/**
 * The single path for human-initiated status changes. COLLECTED is only
 * reachable through pickup-token verification and CONFIRMED only through a
 * verified payment, so both are rejected here.
 */
export async function changeOrderStatus(
  actor: Actor,
  input: z.input<typeof changeStatusSchema>,
): Promise<{ status: OrderStatusValue; refund?: 'processed' | 'pending_gateway' | 'failed' }> {
  const parsed = changeStatusSchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', 'Invalid request.')
  const { orderId, to, reason } = parsed.data
  const kind = actorKindFor(actor)

  if (kind === 'CANTEEN' && !actor.permissions.includes('ORDERS')) {
    throw new AppError('FORBIDDEN', 'You do not have permission to manage orders.')
  }
  if (kind === 'STAFF' && !actor.permissions.includes('PAYMENTS')) {
    throw new AppError('FORBIDDEN', 'You do not have permission to cancel or refund orders.')
  }
  if (to === 'COLLECTED') throw new AppError('VALIDATION', 'Verify the pickup token to mark an order collected.')
  if (to === 'CONFIRMED') throw new AppError('VALIDATION', 'Orders are confirmed only by a verified payment.')
  if (to === 'REFUND_PENDING' && kind !== 'STUDENT' && !reason) {
    throw new AppError('VALIDATION', 'Please give a reason — the student will see it.')
  }

  const result = await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { payments: { where: { status: 'SUCCEEDED' }, take: 1 } },
    })
    // Students only ever see their own orders (no IDOR): treat others as not found
    if (!order || (kind === 'STUDENT' && order.userId !== actor.userId)) {
      throw new AppError('NOT_FOUND', 'Order not found.')
    }
    const from = order.status as OrderStatusValue
    if (!canTransition(from, to, kind)) {
      throw new AppError(
        'CONFLICT',
        `This order is ${ORDER_STATUS_LABEL[from].toLowerCase()} and can't be moved to ${ORDER_STATUS_LABEL[to].toLowerCase()}.`,
      )
    }
    const paid = order.payments[0]
    if (['ACCEPTED', 'PREPARING', 'READY'].includes(to) && !paid) {
      throw new AppError('CONFLICT', 'Only paid orders can be prepared.')
    }
    if (to === 'REFUND_PENDING' && !paid) {
      throw new AppError('CONFLICT', 'There is no successful payment to refund.')
    }

    const tsField = TIMESTAMP_FIELD[to]
    const moved = await tx.order.updateMany({
      where: { id: order.id, status: from }, // compare-and-set against concurrent changes
      data: {
        status: to,
        ...(tsField ? { [tsField]: new Date() } : {}),
        ...(to === 'CANCELLED' || to === 'REFUND_PENDING' ? { cancelReason: reason ?? 'Cancelled by student' } : {}),
      },
    })
    if (!moved.count) throw new AppError('CONFLICT', 'This order was just updated by someone else. Refresh and try again.')

    if (to === 'CANCELLED') {
      await tx.payment.updateMany({
        where: { orderId: order.id, status: 'CREATED' },
        data: { status: 'FAILED', failureReason: 'order_cancelled' },
      })
    }

    let refundId: string | null = null
    if (to === 'REFUND_PENDING' && paid) {
      const refund = await tx.refund.create({
        data: {
          orderId: order.id,
          paymentId: paid.id,
          amount: paid.amount,
          reason: reason ?? 'Cancelled by student before preparation',
          initiatedById: actor.userId,
        },
      })
      refundId = refund.id
    }

    await recordStatusChange(tx, {
      order,
      from,
      to,
      actorKind: kind,
      actorUserId: actor.userId,
      note: reason ?? null,
    })

    if (kind !== 'STUDENT') {
      await audit(
        {
          actor,
          action: `order.${to.toLowerCase()}`,
          entityType: 'Order',
          entityId: order.id,
          metadata: { orderNumber: order.orderNumber, from, to, reason: reason ?? null },
        },
        tx,
      )
    }
    return { refundId }
  })

  let refund: 'processed' | 'pending_gateway' | 'failed' | undefined
  if (result.refundId) {
    // Rejected / cancelled paid orders trigger the refund workflow immediately
    try {
      const r = await processRefund(result.refundId, null)
      refund = r === 'pending_gateway' ? 'pending_gateway' : 'processed'
    } catch (e) {
      console.error('[orders] automatic refund failed; staff can retry', e)
      refund = 'failed'
    }
  }
  return { status: to, refund }
}

/** Student self-service cancel: unpaid → cancelled, paid but not yet accepted → refund. */
export async function cancelOrderAsStudent(actor: Actor, orderId: string) {
  if (actor.role !== 'STUDENT') throw new AppError('FORBIDDEN', 'Not allowed.')
  const order = await db.order.findFirst({ where: { id: orderId, userId: actor.userId } })
  if (!order) throw new AppError('NOT_FOUND', 'Order not found.')
  if (order.status === 'PAYMENT_PENDING') return changeOrderStatus(actor, { orderId, to: 'CANCELLED' })
  if (order.status === 'CONFIRMED') return changeOrderStatus(actor, { orderId, to: 'REFUND_PENDING' })
  throw new AppError('CONFLICT', 'The canteen has already started on this order, so it can no longer be cancelled.')
}
