import 'server-only'
import type { OrderStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import type { Actor } from '@/lib/auth/guards'
import { enforceRateLimit } from '@/lib/auth/rate-limit'
import { verifyPassword } from '@/lib/auth/password'
import { createSupabaseAuthClient, supabaseConfig } from '@/lib/auth/supabase'

/**
 * Permanent, self-service deletion of a USER account. It cannot be undone.
 *
 * - The user re-enters their password and types DELETE.
 * - Orders that are being prepared, ready or awaiting a refund block deletion
 *   (money or food is still in flight). Unpaid orders are cancelled.
 * - Their Supabase login is deleted (public.delete_own_user(), see README).
 * - No orders: the CampusBite account row is deleted completely.
 *   With orders: all personal data is erased and the account is anonymised —
 *   orders and payments stay only as anonymous records for the canteen's accounts.
 */

export const DELETE_CONFIRM_WORD = 'DELETE'
export const DELETED_EMAIL_DOMAIN = 'deleted.campusbite.invalid'
export const isDeletedAccountEmail = (email: string) => email.endsWith(`@${DELETED_EMAIL_DOMAIN}`)

const IN_PROGRESS: OrderStatus[] = ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'REFUND_PENDING']

export async function deleteOwnAccount(
  actor: Actor,
  input: { password: string; confirm: string },
): Promise<{ anonymised: boolean }> {
  if (actor.role !== 'USER') throw new AppError('FORBIDDEN', 'Only user accounts can be deleted here.')
  if ((input.confirm ?? '').trim() !== DELETE_CONFIRM_WORD) {
    throw new AppError('VALIDATION', `Type ${DELETE_CONFIRM_WORD} to confirm.`)
  }
  if (!input.password) throw new AppError('VALIDATION', 'Enter your password.')
  await enforceRateLimit(`account-delete:${actor.userId}`, 5, 15 * 60)

  const user = await db.user.findUnique({ where: { id: actor.userId } })
  if (!user || user.role !== 'USER') throw new AppError('NOT_FOUND', 'Account not found.')

  // 1. Password check (Supabase for registered users; local hash for older demo accounts)
  const sb = user.supabaseUserId && supabaseConfig().configured ? createSupabaseAuthClient() : null
  if (sb) {
    const { error } = await sb.auth.signInWithPassword({ email: user.email, password: input.password })
    if (error) throw new AppError('UNAUTHORIZED', 'Incorrect password.')
  } else if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError('UNAUTHORIZED', 'Incorrect password.')
  }

  // 2. Nothing may be in flight
  const busy = await db.order.findFirst({
    where: { userId: user.id, status: { in: IN_PROGRESS } },
    select: { orderNumber: true, status: true },
  })
  if (busy) {
    await sb?.auth.signOut()
    throw new AppError(
      'CONFLICT',
      busy.status === 'REFUND_PENDING'
        ? `Order ${busy.orderNumber} is waiting for a refund. You can delete your account once the refund is complete.`
        : `Order ${busy.orderNumber} is still in progress. You can delete your account after it has been collected.`,
    )
  }

  // 3. Delete the Supabase login (while we hold the user's own session)
  let supabase: 'deleted' | 'failed' | 'none' = 'none'
  if (sb) {
    const { error } = await sb.rpc('delete_own_user')
    supabase = error ? 'failed' : 'deleted'
    if (error) console.error('[account-deletion] Supabase login not deleted', error.code, error.message)
    await sb.auth.signOut().catch(() => undefined)
  }

  // 4. Erase CampusBite data
  const orderCount = await db.order.count({ where: { userId: user.id } })
  await db.$transaction(async (tx) => {
    const now = new Date()
    const unpaid = await tx.order.findMany({ where: { userId: user.id, status: 'PAYMENT_PENDING' }, select: { id: true } })
    for (const o of unpaid) {
      await tx.order.update({ where: { id: o.id }, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'Account deleted' } })
      await tx.orderStatusHistory.create({
        data: { orderId: o.id, fromStatus: 'PAYMENT_PENDING', toStatus: 'CANCELLED', actorRole: 'SYSTEM', note: 'Account deleted' },
      })
    }
    await tx.session.deleteMany({ where: { userId: user.id } })
    await tx.notification.deleteMany({ where: { userId: user.id } })
    await tx.realtimeEvent.deleteMany({ where: { forUserId: user.id } })
    await tx.userProfile.deleteMany({ where: { userId: user.id } })
    // Rate-limit keys contain the email address
    await tx.rateLimitBucket.deleteMany({ where: { key: { contains: user.email } } })

    if (orderCount === 0) {
      await tx.user.delete({ where: { id: user.id } })
    } else {
      await tx.user.update({
        where: { id: user.id },
        data: {
          name: 'Deleted user',
          email: `deleted-${user.id}@${DELETED_EMAIL_DOMAIN}`,
          passwordHash: null,
          supabaseUserId: null,
          status: 'DEACTIVATED',
          emailVerifiedAt: null,
          lastLoginAt: null,
          mustChangePassword: false,
        },
      })
    }
    // No email or name in the audit entry — the account is gone
    await audit(
      {
        action: 'user.account_deleted',
        entityType: 'User',
        entityId: user.id,
        metadata: { anonymised: orderCount > 0, orders: orderCount, supabaseLogin: supabase },
      },
      tx,
    )
  })
  return { anonymised: orderCount > 0 }
}
