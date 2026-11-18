'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { toActionError, type ActionResult } from '@/lib/errors'
import { requireActor } from '@/lib/auth/guards'
import { createOrder, quoteCart, type CartQuote, type CheckoutSession } from '@/lib/orders/create-order'
import { cancelOrderAsUser } from '@/lib/orders/transitions'
import { simulatePayment } from '@/lib/payments/simulator'
import { reconcileRazorpayPayment } from '@/lib/payments/razorpay-handlers'
import { deleteOwnAccount } from '@/lib/account-deletion'
import { destroySession, getSessionUser } from '@/lib/auth/session'
import { changeOwnPassword } from '@/lib/auth/change-password'

const linesSchema = z.array(z.object({ foodItemId: z.string().max(40), quantity: z.number().int().min(1).max(10) })).max(15)

export async function quoteCartAction(lines: { foodItemId: string; quantity: number }[]): Promise<ActionResult<CartQuote>> {
  try {
    await requireActor('USER')
    const parsed = linesSchema.safeParse(lines)
    return { ok: true, data: await quoteCart(parsed.success ? parsed.data : []) }
  } catch (e) {
    return toActionError(e)
  }
}

export async function placeOrderAction(input: {
  items: { foodItemId: string; quantity: number }[]
  idempotencyKey: string
  pickupSlot: string | null
}): Promise<ActionResult<CheckoutSession>> {
  try {
    const actor = await requireActor('USER')
    return { ok: true, data: await createOrder(actor, input) }
  } catch (e) {
    return toActionError(e)
  }
}

export async function cancelOrderAction(orderId: string): Promise<ActionResult<{ refund?: string }>> {
  try {
    const actor = await requireActor('USER')
    const r = await cancelOrderAsUser(actor, orderId)
    revalidatePath('/user', 'layout')
    return {
      ok: true,
      data: { refund: r.refund },
      message: r.status === 'CANCELLED' ? 'Order cancelled.' : 'Order cancelled — your refund has been started.',
    }
  } catch (e) {
    return toActionError(e)
  }
}

/** "Check payment status": asks Razorpay directly (never trusts the browser). */
export async function checkPaymentStatusAction(orderId: string): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = await requireActor('USER')
    const payment = await db.payment.findFirst({
      where: { order: { id: String(orderId).slice(0, 40), userId: actor.userId }, provider: 'RAZORPAY' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (!payment) return { ok: false, error: 'No online payment found for this order.' }
    const status = await reconcileRazorpayPayment(payment.id)
    revalidatePath('/user', 'layout')
    const message =
      status === 'paid' ? 'Payment verified.' : status === 'failed' ? 'The payment failed. No money was taken.' : 'No completed payment yet.'
    return { ok: true, data: { status }, message }
  } catch (e) {
    return toActionError(e)
  }
}

/** DEVELOPMENT SIMULATOR — no real money moves. */
export async function simulatePaymentAction(
  paymentId: string,
  outcome: 'success' | 'failure',
): Promise<ActionResult<{ outcome: string; orderId?: string }>> {
  try {
    const actor = await requireActor('USER')
    const r = await simulatePayment(actor, paymentId, outcome)
    revalidatePath('/user', 'layout')
    return { ok: true, data: { outcome: r.outcome, orderId: 'orderId' in r ? r.orderId : undefined } }
  } catch (e) {
    return toActionError(e)
  }
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(80, 'Name is too long'),
  department: z.string().trim().max(80).optional().transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .max(15)
    .regex(/^(\+?\d[\d\s-]{6,14})?$/, 'Enter a valid phone number')
    .optional()
    .transform((v) => v || null),
  dietaryPreference: z.enum(['NO_PREFERENCE', 'VEG', 'NON_VEG']),
  orderUpdatesEnabled: z.boolean().optional(),
})

export async function updateProfileAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireActor('USER')
    const parsed = profileSchema.safeParse({
      fullName: String(formData.get('fullName') ?? ''),
      department: String(formData.get('department') ?? ''),
      phone: formData.get('phone') ?? '',
      dietaryPreference: formData.get('dietaryPreference'),
      // Only changed when the form includes the switch; otherwise the saved value is kept
      orderUpdatesEnabled: formData.has('orderUpdatesEnabledField') ? formData.get('orderUpdatesEnabled') === 'on' : undefined,
    })
    if (!parsed.success) {
      return { ok: false, error: 'Please check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    // Users edit their own name and details; email and role are never editable here
    const { fullName, ...profile } = parsed.data
    await db.$transaction([
      db.user.update({ where: { id: actor.userId }, data: { name: fullName } }),
      db.userProfile.update({ where: { userId: actor.userId }, data: profile }),
    ])
    revalidatePath('/user', 'layout')
    return { ok: true, data: undefined, message: 'Profile saved.' }
  } catch (e) {
    return toActionError(e)
  }
}

export async function markNotificationsReadAction(): Promise<void> {
  const actor = await requireActor('USER')
  await db.notification.updateMany({ where: { userId: actor.userId, readAt: null }, data: { readAt: new Date() } })
  revalidatePath('/user/dashboard')
}

export type DeleteAccountState = { error?: string } | undefined

/** Permanently deletes the signed-in user's account. Cannot be undone. */
export async function deleteAccountAction(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  try {
    const actor = await requireActor('USER')
    await deleteOwnAccount(actor, {
      password: String(formData.get('password') ?? ''),
      confirm: String(formData.get('confirm') ?? ''),
    })
  } catch (e) {
    return { error: toActionError(e).error }
  }
  await destroySession()
  redirect('/goodbye')
}

export type ChangePasswordState =
  | { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string[] | undefined>; nonce?: number }
  | undefined

/** Profile → Account Security. Stays on the page; signs out other devices. */
export async function changePasswordInlineAction(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const session = await getSessionUser()
  if (!session || session.role !== 'USER') return { error: 'Your session has expired. Please sign in again.' }
  try {
    const r = await changeOwnPassword(
      { userId: session.id, sessionId: session.sessionId },
      {
        currentPassword: String(formData.get('currentPassword') ?? ''),
        newPassword: String(formData.get('newPassword') ?? ''),
        confirmPassword: String(formData.get('confirmPassword') ?? ''),
      },
    )
    if (!r.ok) return { error: r.error ?? 'Please check the highlighted fields.', fieldErrors: r.fieldErrors }
  } catch (e) {
    return { error: toActionError(e).error }
  }
  return { ok: true, message: 'Password changed. Other devices have been signed out.', nonce: Date.now() }
}
