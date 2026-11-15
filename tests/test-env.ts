import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Loads .env and points the app at a separate *_test database. */
export function loadTestEnv(): Record<string, string> {
  const file = path.resolve(process.cwd(), '.env')
  const vars: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim())
    if (m) vars[m[1]] = m[2]
  }
  const url = new URL(vars.DATABASE_URL)
  url.pathname = `${url.pathname.replace(/^\//, '')}_test`.replace(/^/, '/')
  const testUrl = url.toString()
  return {
    ...vars,
    DATABASE_URL: testUrl,
    DIRECT_URL: testUrl,
    APP_TIMEZONE: 'Asia/Kolkata',
    COLLEGE_PROVIDER: 'mock',
    COLLEGE_EMAIL_DOMAINS: 'college.edu',
    PAYMENT_PROVIDER: 'simulator',
    PAYMENT_SIMULATOR_ENABLED: 'true',
    PAYMENT_SIMULATOR_SECRET: 'test-simulator-secret-0123456789',
    RAZORPAY_KEY_ID: 'rzp_test_key',
    RAZORPAY_KEY_SECRET: 'test_key_secret',
    RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
    EMAIL_PROVIDER: 'dev-outbox',
  }
}
