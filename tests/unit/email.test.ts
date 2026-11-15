import { afterEach, describe, expect, it, vi } from 'vitest'

// Capture what the SMTP adapter hands to nodemailer — no real email is sent.
const sendMail = vi.fn(async () => ({ messageId: 'test' }))
const createTransport = vi.fn(() => ({ sendMail }))
vi.mock('nodemailer', () => ({ default: { createTransport } }))

const { sendEmail, studentLinkEmail } = await import('@/lib/email')

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
  sendMail.mockClear()
  createTransport.mockClear()
})

describe('activation email content', () => {
  it('matches the required wording and contains no password', () => {
    const link = 'https://example.test/activate/confirm?token=abc'
    const m = studentLinkEmail('ACTIVATION', link, 30)
    expect(m.subject).toBe('Activate Your CampusBite Account')
    for (const line of [
      'Welcome to CampusBite!',
      'Your college email has been verified successfully.',
      'Click the button below to create your password and activate your account.',
      'can only be used once.',
      'If you did not request this activation, you can ignore this email.',
    ]) {
      expect(m.text).toContain(line)
    }
    expect(m.html).toContain('Activate My Account')
    expect(m.html).toContain(`href="${link}"`)
    expect(m.text.toLowerCase()).not.toContain('password:')
  })

  it('escapes the link in HTML', () => {
    const m = studentLinkEmail('ACTIVATION', 'https://x.test/?a="><script>', 30)
    expect(m.html).not.toContain('<script>')
  })
})

describe('SMTP delivery (e.g. Gmail app password)', () => {
  it('sends through nodemailer with TLS on port 465', async () => {
    Object.assign(process.env, {
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_USER: 'sender@example.com',
      SMTP_PASS: 'app-password',
    })
    await sendEmail({ to: 'student@college.edu', ...studentLinkEmail('ACTIVATION', 'https://x.test/l', 30) })
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'sender@example.com', pass: 'app-password' } }),
    )
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'student@college.edu', from: 'sender@example.com', subject: 'Activate Your CampusBite Account' }),
    )
  })

  it('refuses to send when SMTP is half-configured', async () => {
    Object.assign(process.env, { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.gmail.com', SMTP_USER: '', SMTP_PASS: '' })
    await expect(sendEmail({ to: 'a@b.c', subject: 's', text: 't' })).rejects.toThrow(/not fully configured/)
    expect(sendMail).not.toHaveBeenCalled()
  })
})
