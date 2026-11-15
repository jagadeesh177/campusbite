import 'server-only'
import { randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const ROUNDS = 12

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number')

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS)
}

let dummyHash: Promise<string> | null = null

/**
 * Compares in constant-ish time even when the user doesn't exist, so login
 * response time doesn't reveal which emails have accounts.
 */
export async function verifyPassword(password: string, hash: string | null | undefined) {
  if (!hash) {
    dummyHash ??= bcrypt.hash('campusbite-dummy-password', ROUNDS)
    await bcrypt.compare(password, await dummyHash)
    return false
  }
  return bcrypt.compare(password, hash)
}

/** Readable one-time password for admin-created accounts (must be changed on first login). */
export function generateTemporaryPassword(): string {
  const words = 'Mango Tiffin Chai Dosa Idli Lassi Vada Poha Upma Kulfi Jalebi Bhel'.split(' ')
  const pick = () => words[randomInt(words.length)]
  return `${pick()}-${pick()}-${String(randomInt(10000)).padStart(4, '0')}`
}
