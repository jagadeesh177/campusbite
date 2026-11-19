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

export interface GatewayRefundInput {
  /** Our Refund.id — sent as receipt + note so a retry can find an existing refund */
  refundId: string
  gatewayPaymentId: string
  amountPaise: number
  notes?: Record<string, string>
}

/** A refund exactly as the gateway reports it. */
export interface GatewayRefund {
  gatewayRefundId: string
  status: 'pending' | 'processed' | 'failed'
  amountPaise: number
  speedRequested: string | null
  speedProcessed: string | null
  bankReference: string | null
  /** Only the development simulator sets this: its "refund" is final immediately */
  simulated?: boolean
}

export interface PaymentGateway {
  readonly provider: PaymentProvider
  createOrder(input: CreateGatewayOrderInput): Promise<{ gatewayOrderId: string }>
  refund(input: GatewayRefundInput): Promise<GatewayRefund>
  /** The refund for our Refund.id, if one was already created (e.g. a timed-out request) */
  findRefund(gatewayPaymentId: string, refundId: string): Promise<GatewayRefund | null>
  fetchRefund(gatewayPaymentId: string, gatewayRefundId: string): Promise<GatewayRefund>
}

type RazorpayRefundEntity = {
  id: string
  status: string
  amount: number | string
  receipt?: string | null
  notes?: Record<string, unknown> | unknown[]
  speed_requested?: string | null
  speed_processed?: string | null
  acquirer_data?: Record<string, unknown> | null
}

export function toGatewayRefund(r: RazorpayRefundEntity): GatewayRefund {
  const a = (r.acquirer_data ?? {}) as Record<string, unknown>
  const ref = [a.arn, a.rrn, a.utr].find((v) => typeof v === 'string' && v) as string | undefined
  const status = r.status === 'processed' || r.status === 'failed' ? r.status : 'pending'
  return {
    gatewayRefundId: r.id,
    status,
    amountPaise: Number(r.amount),
    speedRequested: r.speed_requested ?? null,
    speedProcessed: r.speed_processed ?? null,
    bankReference: ref ?? null,
  }
}

function refundNoteId(r: RazorpayRefundEntity): string | null {
  const n = r.notes && !Array.isArray(r.notes) ? (r.notes as Record<string, unknown>).refundId : null
  return typeof n === 'string' ? n : (r.receipt ?? null)
}

/** Readable text from a Razorpay SDK error ({ statusCode, error: { description } }). */
export function gatewayErrorText(e: unknown): string {
  const err = e as { error?: { description?: string }; message?: string }
  return (err?.error?.description || err?.message || String(e)).slice(0, 300)
}

export function isInsufficientBalance(e: unknown): boolean {
  return /not have enough balance|insufficient balance|low balance/i.test(gatewayErrorText(e))
}

// ---------------------------------------------------------------------------
// Razorpay (UPI is enabled in the Razorpay dashboard; checkout shows it)
// ---------------------------------------------------------------------------

export class RazorpayGateway implements PaymentGateway {
  readonly provider = 'RAZORPAY' as const
  private readonly client: Razorpay

  constructor(keyId: string, keySecret: string) {
    if (!keyId || !keySecret) throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required')
    assertRazorpayModeAllowed(keyId)
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

  /** Payments made against one Razorpay order (to recover from a missed callback/webhook). */
  async fetchOrderPayments(orderId: string) {
    const r = await this.client.orders.fetchPayments(orderId)
    return (r.items ?? []).map((p) => ({
      id: p.id,
      orderId: p.order_id,
      status: p.status,
      amountPaise: Number(p.amount),
      currency: p.currency,
      method: p.method,
    }))
  }

  /** Captures an authorized payment (only needed when automatic capture is off). */
  async capture(paymentId: string, amountPaise: number, currency: string) {
    const p = await this.client.payments.capture(paymentId, amountPaise, currency)
    return { status: p.status }
  }

  /**
   * Instant refund when possible: speed "optimum" makes Razorpay use the instant
   * route where the bank/method supports it and fall back to normal (5–7 working
   * days) otherwise. The response is NOT treated as confirmation; refund.processed
   * (or a later status lookup) is.
   */
  async refund(i: GatewayRefundInput): Promise<GatewayRefund> {
    const r = await this.client.payments.refund(i.gatewayPaymentId, {
      amount: i.amountPaise,
      speed: 'optimum',
      receipt: i.refundId,
      notes: { ...i.notes, refundId: i.refundId },
    })
    return toGatewayRefund(r as unknown as RazorpayRefundEntity)
  }

  async findRefund(gatewayPaymentId: string, refundId: string): Promise<GatewayRefund | null> {
    const list = await this.client.payments.fetchMultipleRefund(gatewayPaymentId, { count: 100 })
    const mine = (list.items as unknown as RazorpayRefundEntity[]).filter((r) => refundNoteId(r) === refundId)
    // After a failed attempt and a retry there can be two; the live one wins
    const found = mine.find((r) => r.status !== 'failed') ?? mine[0]
    return found ? toGatewayRefund(found) : null
  }

  async fetchRefund(gatewayPaymentId: string, gatewayRefundId: string): Promise<GatewayRefund> {
    const r = await this.client.payments.fetchRefund(gatewayPaymentId, gatewayRefundId)
    return toGatewayRefund(r as unknown as RazorpayRefundEntity)
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

  // Simulated refunds move no money; they are final at once and clearly marked.
  async refund(i: GatewayRefundInput): Promise<GatewayRefund> {
    return {
      gatewayRefundId: `sim_rfnd_${randomBytes(10).toString('hex')}`,
      status: 'processed',
      amountPaise: i.amountPaise,
      speedRequested: 'optimum',
      speedProcessed: 'instant',
      bankReference: null,
      simulated: true,
    }
  }

  async findRefund() {
    return null
  }

  async fetchRefund(): Promise<GatewayRefund> {
    throw new Error('Simulated refunds have no gateway record')
  }
}

// ---------------------------------------------------------------------------
// Test Mode guard: live keys (rzp_live_…) are refused unless RAZORPAY_ALLOW_LIVE
// is explicitly "true", so a misconfigured deployment cannot take real money.
// ---------------------------------------------------------------------------

export function razorpayMode(keyId: string): 'test' | 'live' | 'unknown' {
  if (keyId.startsWith('rzp_test_')) return 'test'
  if (keyId.startsWith('rzp_live_')) return 'live'
  return 'unknown'
}

export function assertRazorpayModeAllowed(keyId: string) {
  const mode = razorpayMode(keyId)
  if (mode === 'test') return
  if (mode === 'live' && env.razorpay.allowLive) return
  throw new Error(
    mode === 'live'
      ? 'Razorpay LIVE keys are configured but RAZORPAY_ALLOW_LIVE is not "true". Refusing to take real payments.'
      : 'RAZORPAY_KEY_ID does not look like a Razorpay key (expected rzp_test_… or rzp_live_…).',
  )
}

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
  // Refunding a simulated payment moves no money, so it must keep working after
  // the simulator is switched off for new payments (old test orders still exist).
  return simulator
}

export function isSimulatorActive(): boolean {
  return env.paymentProvider !== 'razorpay' && env.simulatorEnabled
}
