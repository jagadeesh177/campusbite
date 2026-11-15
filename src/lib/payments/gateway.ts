import 'server-only'
import { randomBytes } from 'node:crypto'
import Razorpay from 'razorpay'
import type { PaymentProvider } from '@prisma/client'
import { env } from '@/lib/env'

export interface CreateGatewayOrderInput {
  amountPaise: number
  receipt: string
  notes?: Record<string, string>
}

export interface GatewayRefundResult {
  gatewayRefundId: string
  /** false when the gateway accepted the refund but settles it later (webhook) */
  processed: boolean
}

export interface PaymentGateway {
  readonly provider: PaymentProvider
  createOrder(input: CreateGatewayOrderInput): Promise<{ gatewayOrderId: string }>
  refund(input: {
    gatewayPaymentId: string
    amountPaise: number
    notes?: Record<string, string>
  }): Promise<GatewayRefundResult>
}

// ---------------------------------------------------------------------------
// Razorpay (UPI is enabled in the Razorpay dashboard; checkout shows it)
// ---------------------------------------------------------------------------

export class RazorpayGateway implements PaymentGateway {
  readonly provider = 'RAZORPAY' as const
  private readonly client: Razorpay

  constructor(keyId: string, keySecret: string) {
    if (!keyId || !keySecret) throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required')
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret })
  }

  async createOrder(i: CreateGatewayOrderInput) {
    const order = await this.client.orders.create({
      amount: i.amountPaise,
      currency: 'INR',
      receipt: i.receipt,
      notes: i.notes,
    })
    return { gatewayOrderId: order.id }
  }

  /** Server-side lookup used to confirm amount/currency/status after checkout. */
  async fetchPayment(paymentId: string) {
    const p = await this.client.payments.fetch(paymentId)
    return {
      id: p.id,
      orderId: p.order_id,
      status: p.status,
      amountPaise: Number(p.amount),
      currency: p.currency,
      method: p.method,
    }
  }

  async refund(i: { gatewayPaymentId: string; amountPaise: number; notes?: Record<string, string> }) {
    const r = await this.client.payments.refund(i.gatewayPaymentId, {
      amount: i.amountPaise,
      speed: 'normal',
      notes: i.notes,
    })
    return { gatewayRefundId: r.id, processed: r.status === 'processed' }
  }
}

// ---------------------------------------------------------------------------
// DEVELOPMENT PAYMENT SIMULATOR — NOT A REAL PAYMENT
// ---------------------------------------------------------------------------

export class SimulatorGateway implements PaymentGateway {
  readonly provider = 'SIMULATOR' as const

  async createOrder() {
    return { gatewayOrderId: `sim_order_${randomBytes(10).toString('hex')}` }
  }

  async refund() {
    return { gatewayRefundId: `sim_rfnd_${randomBytes(10).toString('hex')}`, processed: true }
  }
}

// ---------------------------------------------------------------------------

let razorpay: RazorpayGateway | null = null
const simulator = new SimulatorGateway()

export function getRazorpayGateway(): RazorpayGateway {
  razorpay ??= new RazorpayGateway(env.razorpay.keyId, env.razorpay.keySecret)
  return razorpay
}

/** Gateway used for NEW payments. */
export function getActiveGateway(): PaymentGateway {
  if (env.paymentProvider === 'razorpay') return getRazorpayGateway()
  if (env.simulatorEnabled) return simulator
  throw new Error(
    'No payment gateway configured. Set PAYMENT_PROVIDER="razorpay" with keys, or enable the development simulator.',
  )
}

/** Gateway that handled an EXISTING payment (refunds must go back the same way). */
export function getGatewayFor(provider: PaymentProvider): PaymentGateway {
  if (provider === 'RAZORPAY') return getRazorpayGateway()
  if (!env.simulatorEnabled) throw new Error('Payment simulator is disabled')
  return simulator
}

export function isSimulatorActive(): boolean {
  return env.paymentProvider !== 'razorpay' && env.simulatorEnabled
}
