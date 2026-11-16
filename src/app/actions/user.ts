'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { toActionError, type ActionResult } from '@/lib/errors'
import { requireActor } from '@/lib/auth/guards'
import { createOrder, quoteCart, type CartQuote, type CheckoutSession } from '@/lib/orders/create-order'
import { cancelOrderAsUser } from '@/lib/orders/transitions'
import { simulatePayment } from '@/lib/payments/simulator'

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
  phone: z
    .string()
    .trim()
    .max(15)
    .regex(/^(\+?\d[\d\s-]{6,14})?$/, 'Enter a valid phone number')
    .optional()
    .transform((v) => v || null),
  dietaryPreference: z.enum(['NO_PREFERENCE', 'VEG', 'NON_VEG']),
  orderUpdatesEnabled: z.boolean(),
})

export async function updateProfileAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireActor('USER')
    const parsed = profileSchema.safeParse({
      phone: formData.get('phone') ?? '',
      dietaryPreference: formData.get('dietaryPreference'),
      orderUpdatesEnabled: formData.get('orderUpdatesEnabled') === 'on',
    })
    if (!parsed.success) {
      return { ok: false, error: 'Please check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    // Only non-sensitive preferences are editable — college data is read-only
    await db.userProfile.update({ where: { userId: actor.userId }, data: parsed.data })
    revalidatePath('/user/profile')
    return { ok: true, data: undefined, message: 'Preferences saved.' }
  } catch (e) {
    return toActionError(e)
  }
}

export async function markNotificationsReadAction(): Promise<void> {
  const actor = await requireActor('USER')
  await db.notification.updateMany({ where: { userId: actor.userId, readAt: null }, data: { readAt: new Date() } })
  revalidatePath('/user/dashboard')
}
