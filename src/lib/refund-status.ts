// Shared, client-safe refund status wording. Every page uses these so the
// customer, staff and canteen always see the same, accurate refund state.

export const REFUND_STATUSES = ['NOT_REQUESTED', 'REQUESTED', 'PROCESSING', 'PROCESSED', 'CREDITED', 'FAILED', 'REVERSED'] as const
export type RefundStatusValue = (typeof REFUND_STATUSES)[number]

/** Customer-facing names (REFUND_REQUESTED … REFUND_REVERSED). */
export const REFUND_LABEL: Record<RefundStatusValue, string> = {
  NOT_REQUESTED: 'Refund requested',
  REQUESTED: 'Refund requested',
  PROCESSING: 'Refund processing',
  PROCESSED: 'Refund processed',
  CREDITED: 'Refunded',
  FAILED: 'Refund failed',
  REVERSED: 'Refund reversed',
}

/** Staff see one extra distinction: not yet sent to Razorpay. */
export const REFUND_STAFF_LABEL: Record<RefundStatusValue, string> = {
  ...REFUND_LABEL,
  NOT_REQUESTED: 'Not sent to Razorpay',
  REQUESTED: 'Sent to Razorpay',
  CREDITED: 'Refunded (bank credit confirmed)',
}

export const REFUND_MESSAGE: Record<RefundStatusValue, string> = {
  NOT_REQUESTED: 'Your refund request has been submitted.',
  REQUESTED: 'Your refund request has been submitted.',
  PROCESSING: 'Your refund is being processed. It may take 5–7 working days to reach your bank account.',
  PROCESSED: 'Razorpay has processed your refund. Your bank may take additional time to credit the amount.',
  CREDITED: 'Refund received successfully. The amount has been credited.',
  FAILED: 'Your refund could not be completed. Please contact support.',
  REVERSED: 'Your refund was reversed. Please contact support.',
}

export type RefundTone = 'warning' | 'info' | 'success' | 'danger' | 'violet' | 'neutral'

export const REFUND_TONE: Record<RefundStatusValue, RefundTone> = {
  NOT_REQUESTED: 'warning',
  REQUESTED: 'warning',
  PROCESSING: 'info',
  PROCESSED: 'violet',
  CREDITED: 'success',
  FAILED: 'danger',
  REVERSED: 'danger',
}

/**
 * Expected bank-credit time, from what Razorpay told us about the speed it used.
 * Never a promise: banks decide when the money appears.
 */
export function expectedCreditText(status: RefundStatusValue, speedProcessed: string | null | undefined): string | null {
  if (status === 'CREDITED' || status === 'FAILED' || status === 'REVERSED') return null
  if (speedProcessed === 'instant') return 'Sent by the instant route. Most banks show it within minutes to a few hours.'
  if (speedProcessed === 'normal') return 'Sent by the normal route. Usually 5–7 working days after Razorpay processes it.'
  return 'Usually 5–7 working days. Faster if your bank supports instant refunds.'
}

export const SUPPORT_EMAIL = 'easalajagadeesh@gmail.com'
