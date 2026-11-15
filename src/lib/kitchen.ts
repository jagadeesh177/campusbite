import 'server-only'
import type { KitchenSettings, Prisma, PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { isOpenAt } from '@/lib/time'

type Client = PrismaClient | Prisma.TransactionClient

export async function getKitchenSettings(client: Client = db): Promise<KitchenSettings> {
  return client.kitchenSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  })
}

export interface KitchenStatus {
  open: boolean
  message: string | null
}

export function kitchenStatus(s: KitchenSettings, now = new Date()): KitchenStatus {
  if (!s.acceptingOrders) {
    return { open: false, message: s.pauseMessage || 'The canteen has paused online orders for now.' }
  }
  if (!isOpenAt(now, env.timezone, s.openingTime, s.closingTime)) {
    return {
      open: false,
      message: `Ordering is closed right now. Online orders are taken ${s.openingTime}–${s.closingTime}.`,
    }
  }
  return { open: true, message: null }
}
