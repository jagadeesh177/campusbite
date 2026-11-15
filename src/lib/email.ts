import 'server-only'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

export interface EmailMessage {
  to: string
  subject: string
  text: string
}

/**
 * Email delivery. Only the development outbox is implemented: messages are
 * stored in the database and viewable at /dev/mailbox. Production needs a
 * transactional email provider (SMTP / Resend / SES) — see README.
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  switch (env.emailProvider) {
    case 'dev-outbox':
      await db.devMailMessage.create({ data: { to: msg.to, subject: msg.subject, body: msg.text } })
      if (!env.isProduction) console.info(`[dev-outbox] to=${msg.to} subject="${msg.subject}"`)
      return
    default:
      throw new Error(
        `EMAIL_PROVIDER "${env.emailProvider}" is not configured. Add a transactional email provider before going live.`,
      )
  }
}
