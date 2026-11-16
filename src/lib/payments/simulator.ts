import 'server-only'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { rupeesToPaise } from '@/lib/money'
import type { Actor } from '@/lib/auth/guards'
import { confirmPayment, markPaymentFailed, type ConfirmOutcome } from './confirm'
import { signSimulatorPayload, verifySimulatorSignature } from './signatures'

// ===========================================================================
//  DEVELOPMENT PAYMENT SIMULATOR — NO MONEY MOVES.
//  Produces a signed "gateway callback" that goes through the same server-side
//  verification + confirmPayment() path a real gateway callback would.
// ===========================================================================

interface SimulatorCallback {
  gatewayOrderId: string
  gatewayPaymentId: string
  amountPaise: number
  currency: string
  outcome: 'success' | 'failure'
}

export async function simulatePayment(
  actor: Actor,
  paymentId: string,
  outcome: 'success' | 'failure',
): Promise<ConfirmOutcome | { outcome: 'failed' }> {
  if (!env.simulatorEnabled) throw new AppError('FORBIDDEN', 'The payment simulator is disabled.')
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: true } })
  // Ownership check: a user can only "pay" for their own order
  if (!payment || payment.order.userId !== actor.userId) throw new AppError('NOT_FOUND', 'Payment not found.')
  if (payment.provider !== 'SIMULATOR') throw new AppError('VALIDATION', 'This is not a simulated payment.')

  const callback: SimulatorCallback = {
    gatewayOrderId: payment.gatewayOrderId,
    gatewayPaymentId: `sim_pay_${randomBytes(10).toString('hex')}`,
    amountPaise: rupeesToPaise(payment.amount),
    currency: payment.currency,
    outcome,
  }
  const signature = signSimulatorPayload(callback, env.simulatorSecret)
  return handleSimulatorCallback(callback, signature)
}

export async function handleSimulatorCallback(cb: SimulatorCallback, signature: string) {
  if (!verifySimulatorSignature(cb, signature, env.simulatorSecret)) {
    throw new AppError('PAYMENT', 'Invalid payment signature.')
  }
  if (cb.outcome === 'failure') {
    await markPaymentFailed({ gatewayOrderId: cb.gatewayOrderId, reason: 'Simulated failure' })
    return { outcome: 'failed' as const }
  }
  return confirmPayment({
    gatewayOrderId: cb.gatewayOrderId,
    gatewayPaymentId: cb.gatewayPaymentId,
    amountPaise: cb.amountPaise,
    currency: cb.currency,
    verifiedVia: 'simulator',
    method: 'upi (simulated)',
  })
}
