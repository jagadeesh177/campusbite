'use server'

import { revalidatePath } from 'next/cache'
import { toActionError, type ActionResult } from '@/lib/errors'
import { requireActor } from '@/lib/auth/guards'
import { createAccount, resetAccountPassword, setAccountStatus, setUserAccess, updateAccountPermissions } from '@/lib/admin'
import { confirmRefundCredited, createPartialRefund, processRefund, syncRefund } from '@/lib/payments/refunds'

export async function setUserAccessAction(userId: string, active: boolean): Promise<ActionResult> {
  try {
    const actor = await requireActor('STAFF', 'USERS')
    await setUserAccess(actor, userId, active)
    revalidatePath('/staff/users')
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
      message:
        outcome === 'in_progress'
          ? 'This refund is already with Razorpay. No second refund was sent.'
          : outcome === 'already_processed'
            ? 'Razorpay has already processed this refund.'
            : outcome === 'processed'
              ? 'Refund processed (test simulator).'
              : 'Refund sent to Razorpay. Its status updates when Razorpay confirms it.',
    }
  } catch (e) {
    return toActionError(e)
  }
}

/** Ask Razorpay for a refund's current status. Never creates a refund. */
export async function checkRefundStatusAction(refundId: string): Promise<ActionResult<{ outcome: string }>> {
  try {
    await requireActor('STAFF', 'PAYMENTS')
    const outcome = await syncRefund(String(refundId).slice(0, 40))
    revalidatePath('/staff/payments')
    const message =
      outcome === 'processed' || outcome === 'already_processed'
        ? 'Razorpay has processed this refund.'
        : outcome === 'failed'
          ? 'Razorpay reports this refund failed. You can retry it.'
          : 'Still processing at Razorpay.'
    return { ok: true, data: { outcome }, message }
  } catch (e) {
    return toActionError(e)
  }
}

/** Mark REFUNDED only with evidence that the customer's bank received it. */
export async function confirmRefundCreditAction(refundId: string, evidence: string): Promise<ActionResult> {
  try {
    const actor = await requireActor('STAFF', 'PAYMENTS')
    await confirmRefundCredited(actor, String(refundId).slice(0, 40), String(evidence ?? ''))
    revalidatePath('/staff/payments')
    return { ok: true, data: undefined, message: 'Marked as refunded. Your name, the time and the evidence were recorded.' }
  } catch (e) {
    return toActionError(e)
  }
}

export async function partialRefundAction(paymentId: string, amountRupees: string, reason: string): Promise<ActionResult<{ outcome: string }>> {
  try {
    const actor = await requireActor('STAFF', 'PAYMENTS')
    const rupees = Number(String(amountRupees).replace(/[₹,\s]/g, ''))
    if (!Number.isFinite(rupees)) return { ok: false, error: 'Enter an amount in rupees.' }
    const r = await createPartialRefund(actor, { paymentId: String(paymentId).slice(0, 40), amountPaise: Math.round(rupees * 100), reason: String(reason ?? '') })
    revalidatePath('/staff/payments')
    return { ok: true, data: { outcome: r.outcome }, message: 'Refund sent to Razorpay.' }
  } catch (e) {
    return toActionError(e)
  }
}
