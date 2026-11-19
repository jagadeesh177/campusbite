/**
 * Set the password of an existing STAFF or KITCHEN account from your own terminal.
 * Use it for the first administrator (who has nobody to reset it for them).
 * After that, administrators reset other accounts in Staff → Accounts.
 *
 *   npx tsx prisma/set-password.ts you@example.com
 *
 * Runs against the database in DATABASE_URL. The password is typed hidden and
 * is never printed or logged. Customer (USER) accounts can't get a password:
 * they sign in with Google.
 */
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

function askHidden(question: string): Promise<string> {
  let muted = false
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk)
      cb()
    },
  })
  const rl = createInterface({ input: process.stdin, output: out, terminal: true })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    muted = true
  })
}

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase()
  if (!email) throw new Error('Usage: npx tsx prisma/set-password.ts you@example.com')
  const db = new PrismaClient()
  try {
    const user = await db.user.findUnique({ where: { email } })
    if (!user) throw new Error(`No account with the email ${email}.`)
    if (user.role === 'USER') throw new Error('That is a customer account. Customers sign in with Google and have no password.')
    console.log(`Setting the password for ${user.name} (${user.role === 'CANTEEN' ? 'Kitchen' : 'Staff'}, ${user.status}).`)

    const password = await askHidden('New password (hidden): ')
    const problems = [
      password.length < 8 && 'use at least 8 characters',
      password.length > 72 && 'use at most 72 characters',
      !/[A-Za-z]/.test(password) && 'include a letter',
      !/\d/.test(password) && 'include a number',
    ].filter(Boolean)
    if (problems.length) throw new Error(`Password not set: ${problems.join(', ')}.`)
    if ((await askHidden('Type it again (hidden): ')) !== password) throw new Error('Passwords did not match. Nothing changed.')

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: false },
    })
    await db.session.deleteMany({ where: { userId: user.id } })
    await db.auditLog.create({
      data: { action: 'account.password_set_cli', entityType: 'User', entityId: user.id, actorRole: 'SYSTEM' },
    })
    console.log(`Done. ${email} can now sign in at /login/${user.role === 'CANTEEN' ? 'canteen' : 'staff'}.`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
