import 'server-only'

// Typed, server-only access to configuration. Read lazily so tests can set
// process.env before calling. Nothing here may be imported by client code.

function flag(name: string): boolean {
  const v = process.env[name]
  return v === 'true' || v === '1'
}

export const env = {
  get appUrl() {
    return process.env.APP_URL ?? 'http://localhost:3000'
  },
  get timezone() {
    return process.env.APP_TIMEZONE ?? 'Asia/Kolkata'
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production'
  },
  get paymentProvider(): 'razorpay' | 'simulator' {
    return process.env.PAYMENT_PROVIDER === 'razorpay' ? 'razorpay' : 'simulator'
  },
  get simulatorEnabled() {
    return flag('PAYMENT_SIMULATOR_ENABLED')
  },
  get simulatorSecret() {
    const s = process.env.PAYMENT_SIMULATOR_SECRET
    if (!s || s.length < 16) throw new Error('PAYMENT_SIMULATOR_SECRET is missing or too short')
    return s
  },
  get razorpay() {
    return {
      keyId: process.env.RAZORPAY_KEY_ID ?? '',
      keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
      /** Must be exactly "true" before live (real-money) keys are accepted */
      allowLive: process.env.RAZORPAY_ALLOW_LIVE === 'true',
    }
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? ''
  },
}
