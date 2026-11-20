import 'server-only'
import { PrismaClient } from '@prisma/client'

// Reuse one client across hot reloads in development and across invocations
// of a warm serverless function in production.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * The hosted Postgres (Neon) sleeps when idle and takes a few seconds to wake.
 * Prisma's default 5 s connect timeout can fail the first request after a quiet
 * period, so allow 15 s unless the URL already sets its own value.
 */
function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL
  if (!url || /[?&]connect_timeout=/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}connect_timeout=15`
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: databaseUrl() } },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
