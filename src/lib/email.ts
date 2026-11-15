import 'server-only'
import nodemailer from 'nodemailer'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

/**
 * Email delivery, selected by EMAIL_PROVIDER:
 *  - dev-outbox: stores messages in the DB (viewable at /dev/mailbox). Development only.
 *  - smtp:       any SMTP server, e.g. Gmail with an app password
 *                (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM)
 *  - resend:     Resend HTTP API (RESEND_API_KEY, EMAIL_FROM)
 * Credentials are server-side only.
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || ''

  switch (env.emailProvider) {
    case 'dev-outbox':
      await db.devMailMessage.create({ data: { to: msg.to, subject: msg.subject, body: msg.text } })
      if (!env.isProduction) console.info(`[dev-outbox] to=${msg.to} subject="${msg.subject}"`)
      return

    case 'smtp': {
      const host = process.env.SMTP_HOST
      const port = Number(process.env.SMTP_PORT || 465)
      const user = process.env.SMTP_USER
      const pass = process.env.SMTP_PASS
      if (!host || !user || !pass) throw new Error('SMTP is not fully configured (SMTP_HOST, SMTP_USER, SMTP_PASS)')
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 10_000,
      })
      await transport.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html })
      return
    }

    case 'resend': {
      const key = process.env.RESEND_API_KEY
      if (!key || !from) throw new Error('Resend is not fully configured (RESEND_API_KEY, EMAIL_FROM)')
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`Resend rejected the email (${res.status})`)
      return
    }

    default:
      throw new Error(`EMAIL_PROVIDER "${env.emailProvider}" is not supported. Use dev-outbox, smtp or resend.`)
  }
}

/** Branded activation-code email (plain text + simple HTML). */
export function activationEmail(code: string): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  return {
    subject: `${code} is your CampusBite activation code`,
    text: `Your CampusBite activation code is ${code}.\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:440px;margin:auto;padding:24px;color:#26332F">
  <div style="font-size:20px;font-weight:700;color:#173F35">Campus<span style="color:#28A879">Bite</span></div>
  <p style="margin:20px 0 8px">Your activation code is</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#173F35;background:#F8FAF7;border:1px solid #E5EBE6;border-radius:12px;padding:16px;text-align:center">${code}</div>
  <p style="color:#66716B;font-size:14px;margin-top:16px">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
</div>`,
  }
}
