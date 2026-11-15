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

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Activation / password-reset email with a single-use link. Never contains a password. */
export function studentLinkEmail(
  purpose: 'ACTIVATION' | 'PASSWORD_RESET',
  link: string,
  ttlMinutes: number,
): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  const activation = purpose === 'ACTIVATION'
  const subject = activation ? 'Activate Your CampusBite Account' : 'Reset your CampusBite password'
  const intro = activation
    ? ['Welcome to CampusBite!', 'Your college email has been verified successfully.', 'Click the button below to create your password and activate your account.']
    : ['We received a request to reset your CampusBite password.', 'Click the button below to choose a new password.']
  const button = activation ? 'Activate My Account' : 'Reset My Password'
  const validity = `This link is valid for ${ttlMinutes} minutes and can only be used once.`
  const ignore = activation
    ? 'If you did not request this activation, you can ignore this email.'
    : 'If you did not request a password reset, you can ignore this email — your password will not change.'

  const text = [...intro, '', `${button}: ${link}`, '', validity, ignore].join('\n')
  const safeLink = escapeHtml(link)
  const html = `<div style="background:#F8FAF7;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#26332F">
  <div style="max-width:480px;margin:auto;background:#FFFFFF;border:1px solid #E5EBE6;border-radius:16px;padding:28px">
    <div style="font-size:20px;font-weight:700;color:#173F35">Campus<span style="color:#28A879">Bite</span></div>
    ${intro.map((p, i) => `<p style="margin:${i === 0 ? '20px' : '10px'} 0 0;${i === 0 ? 'font-size:18px;font-weight:700' : 'font-size:15px'}">${escapeHtml(p)}</p>`).join('\n    ')}
    <p style="margin:24px 0"><a href="${safeLink}" style="display:inline-block;background:#173F35;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">${button}</a></p>
    <p style="font-size:14px;color:#66716B;margin:0">${escapeHtml(validity)}</p>
    <p style="font-size:14px;color:#66716B;margin:8px 0 0">${escapeHtml(ignore)}</p>
    <p style="font-size:12px;color:#66716B;margin:20px 0 0;word-break:break-all">Button not working? Paste this link into your browser:<br>${safeLink}</p>
  </div>
</div>`
  return { subject, text, html }
}
