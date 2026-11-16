'use server'

import { revalidatePath } from 'next/cache'
import { AppError, toActionError, type ActionResult } from '@/lib/errors'
import { requireActor } from '@/lib/auth/guards'
import { changeOrderStatus } from '@/lib/orders/transitions'
import { completePickup, lookupPickup, type PickupPreview } from '@/lib/orders/pickup'
import { saveCategory, saveFoodItem, setItemAvailability, updateKitchenSettings, setAcceptingOrders } from '@/lib/menu'
import type { OrderStatusValue } from '@/lib/order-status'

// ---- Orders (canteen operators with ORDERS permission) ---------------------

export async function changeStatusAction(
  orderId: string,
  to: OrderStatusValue,
  reason?: string,
): Promise<ActionResult<{ refund?: string }>> {
  try {
    const actor = await requireActor('CANTEEN', 'ORDERS')
    const r = await changeOrderStatus(actor, { orderId, to, reason })
    revalidatePath('/canteen/dashboard')
    return { ok: true, data: { refund: r.refund } }
  } catch (e) {
    return toActionError(e)
  }
}

export async function lookupPickupAction(raw: string): Promise<ActionResult<PickupPreview>> {
  try {
    const actor = await requireActor('CANTEEN', 'ORDERS')
    return { ok: true, data: await lookupPickup(actor, raw) }
  } catch (e) {
    return toActionError(e)
  }
}

export async function completePickupAction(raw: string): Promise<ActionResult<{ orderNumber: string }>> {
  try {
    const actor = await requireActor('CANTEEN', 'ORDERS')
    const r = await completePickup(actor, raw)
    revalidatePath('/canteen/dashboard')
    return { ok: true, data: r }
  } catch (e) {
    return toActionError(e)
  }
}

// ---- Menu & settings (canteen MENU/SETTINGS or staff FOOD/SETTINGS) --------

function withFieldErrors(e: unknown) {
  const fe = (e as { fieldErrors?: Record<string, string[] | undefined> }).fieldErrors
  return fe && e instanceof AppError ? { ok: false as const, error: e.message, fieldErrors: fe } : toActionError(e)
}

export async function toggleAvailabilityAction(itemId: string, isAvailable: boolean): Promise<ActionResult> {
  try {
    const actor = await requireActor(['CANTEEN', 'STAFF'])
    await setItemAvailability(actor, itemId, isAvailable)
    revalidatePath('/canteen/menu')
    revalidatePath('/staff/food')
    return { ok: true, data: undefined }
  } catch (e) {
    return toActionError(e)
  }
}

export async function saveFoodItemAction(_prev: ActionResult<{ id: string }> | undefined, formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor(['CANTEEN', 'STAFF'])
    const image = formData.get('image')
    const item = await saveFoodItem(
      actor,
      {
        id: (formData.get('id') as string) || undefined,
        name: String(formData.get('name') ?? ''),
        description: String(formData.get('description') ?? ''),
        price: String(formData.get('price') ?? ''),
        categoryId: String(formData.get('categoryId') ?? ''),
        prepTimeMinutes: Number(formData.get('prepTimeMinutes') ?? 10),
        isVeg: formData.get('isVeg') === 'on',
        isAvailable: formData.get('isAvailable') === 'on',
        isPopular: formData.get('isPopular') === 'on',
      },
      image instanceof File ? image : null,
    )
    revalidatePath('/canteen/menu')
    revalidatePath('/staff/food')
    return { ok: true, data: { id: item.id }, message: 'Item saved.' }
  } catch (e) {
    return withFieldErrors(e)
  }
}

export async function saveCategoryAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor(['CANTEEN', 'STAFF'])
    await saveCategory(actor, {
      id: (formData.get('id') as string) || undefined,
      name: String(formData.get('name') ?? ''),
      description: String(formData.get('description') ?? ''),
      sortOrder: Number(formData.get('sortOrder') ?? 0),
      isActive: formData.get('isActive') === 'on',
    })
    revalidatePath('/canteen/menu')
    revalidatePath('/staff/food')
    return { ok: true, data: undefined, message: 'Category saved.' }
  } catch (e) {
    return toActionError(e)
  }
}

export async function updateKitchenSettingsAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireActor(['CANTEEN', 'STAFF'])
    await updateKitchenSettings(actor, {
      acceptingOrders: formData.get('acceptingOrders') === 'on',
      pauseMessage: String(formData.get('pauseMessage') ?? ''),
      defaultPrepMinutes: Number(formData.get('defaultPrepMinutes')),
      maxConcurrentOrders: Number(formData.get('maxConcurrentOrders')),
      pickupSlotMinutes: Number(formData.get('pickupSlotMinutes')),
      openingTime: String(formData.get('openingTime') ?? ''),
      closingTime: String(formData.get('closingTime') ?? ''),
      convenienceFee: String(formData.get('convenienceFee') ?? ''),
    })
    revalidatePath('/', 'layout')
    return { ok: true, data: undefined, message: 'Kitchen settings saved.' }
  } catch (e) {
    return withFieldErrors(e)
  }
}

export async function setAcceptingOrdersAction(accepting: boolean): Promise<ActionResult> {
  try {
    const actor = await requireActor(['CANTEEN', 'STAFF'])
    await setAcceptingOrders(actor, accepting)
    revalidatePath('/', 'layout')
    return { ok: true, data: undefined, message: accepting ? 'Ordering is open again.' : 'New orders paused.' }
  } catch (e) {
    return toActionError(e)
  }
}
