import 'server-only'
import type { Prisma, PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'
import type { Actor } from '@/lib/auth/guards'
import { getClientInfo } from '@/lib/request'

type Client = PrismaClient | Prisma.TransactionClient

export interface AuditEntry {
  actor?: Pick<Actor, 'userId' | 'role'> | null
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Prisma.InputJsonValue
}

/** Append-only record of security- and money-relevant actions. */
export async function audit(entry: AuditEntry, client: Client = db) {
  const { ip } = await getClientInfo()
  await client.auditLog.create({
    data: {
      actorId: entry.actor?.userId ?? null,
      actorRole: entry.actor?.role ?? 'SYSTEM',
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
      ip,
    },
  })
}
