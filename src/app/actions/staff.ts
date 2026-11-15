'use server'

import { revalidatePath } from 'next/cache'
import { toActionError, type ActionResult } from '@/lib/errors'
import { requireActor } from '@/lib/auth/guards'
import { createAccount, resetAccountPassword, setAccountStatus, setStudentAccess, updateAccountPermissions } from '@/lib/admin'
import { changeOrderStatus } from '@/lib/orders/transitions'
import { processRefund } from '@/lib/payments/refunds'

export async function setStudentAccessAction(userId: string, active: boolean): Promise<ActionResult> {
  try {
    const actor = await requireActor('STAFF', 'STUDENTS')
    await setStudentAccess(actor, userId, active)
    revalidatePath('/staff/students')
    return { ok: true, data: undefined, message: active ? 'Access restored.' : 'Access revoked and sessions signed out.' }
  } catch (e) {
    return toActionError(e)
  }
}

export async function createAccountAction(
  _prev: ActionResult<{ tempPassword: string; email: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ tempPassword: string; email: string }>> {
  try {
    const actor = await requireActor('STAFF')
    const kind = formData.get('kind') === 'STAFF' ? 'STAFF' : 'CANTEEN'
    const email = String(formData.get('email') ?? '')
    const r = await createAccount(actor, {
      kind,
      email,
      name: String(formData.get('name') ?? ''),
      label: String(formData.get('label') ?? ''),
      permissions: formData.getAll('permissions').map(String),
    })
    revalidatePath(kind === 'STAFF' ? '/staff/team' : '/staff/canteen')
    return { ok: true, data: { tempPassword: r.tempPassword, email: email.trim().toLowerCase() } }
  } catch (e) {
    return toActionError(e)
  }
}

export async function updatePermissionsAction(userId: string, permissions: string[]): Promise<ActionResult> {
  try {
    const actor = await requireActor('STAFF')
    await updateAccountPermissions(actor, userId, permissions)
    revalidatePath('/staff/canteen')
    revalidatePath('/staff/team')
    return { ok: true, data: undefined, message: 'Permissions updated. The user will need to sign in again.' }
  } catch (e) {
    return toActionError(e)
  }
}

export async function setAccountStatusAction(userId: string, active: boolean): Promise<ActionResult> {
  try {
    const actor = await requireActor('STAFF')
    await setAccountStatus(actor, userId, active)
    revalidatePath('/staff/canteen')
    revalidatePath('/staff/team')
    return { ok: true, data: undefined, message: active ? 'Account reactivated.' : 'Account deactivated.' }
  } catch (e) {
    return toActionError(e)
  }
}

export async function resetPasswordAction(userId: string): Promise<ActionResult<{ tempPassword: string }>> {
  try {
    const actor = await requireActor('STAFF')
    const r = await resetAccountPassword(actor, userId)
    return { ok: true, data: r }
  } catch (e) {
    return toActionError(e)
  }
}

export async function processRefundAction(refundId: string): Promise<ActionResult<{ outcome: string }>> {
  try {
    const actor = await requireActor('STAFF', 'PAYMENTS')
    const outcome = await processRefund(refundId, actor)
    revalidatePath('/staff/payments')
    return {
      ok: true,
      data: { outcome },
      message: outcome === 'pending_gateway' ? 'Refund submitted — the gateway will confirm it shortly.' : 'Refund processed.',
    }
  } catch (e) {
    return toActionError(e)
  }
}

export async function staffCancelOrderAction(orderId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requireActor('STAFF', 'PAYMENTS')
    await changeOrderStatus(actor, { orderId, to: 'REFUND_PENDING', reason })
    revalidatePath('/staff/payments')
    return { ok: true, data: undefined, message: 'Order cancelled and refund started.' }
  } catch (e) {
    return toActionError(e)
  }
}
