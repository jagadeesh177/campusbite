import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import type { Actor } from '@/lib/auth/guards'

export const prisma = new PrismaClient()

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "RealtimeEvent", "Notification", "AuditLog", "OrderStatusHistory", "PickupToken",
      "Refund", "Payment", "WebhookEvent", "OrderItem", "Order", "FoodItem", "FoodImage", "FoodCategory",
      "Session", "RateLimitBucket", "UserProfile",
      "StaffProfile", "CanteenProfile", "User", "KitchenSettings" RESTART IDENTITY CASCADE`)
}

let hash: string | null = null
async function pw() {
  hash ??= await bcrypt.hash('Passw0rd!', 4)
  return hash
}
export const TEST_PASSWORD = 'Passw0rd!'

export async function setupKitchen(overrides: Partial<{ acceptingOrders: boolean; maxConcurrentOrders: number; convenienceFee: string; openingTime: string; closingTime: string }> = {}) {
  return prisma.kitchenSettings.create({
    data: {
      id: 'default',
      openingTime: '00:00',
      closingTime: '23:59',
      convenienceFee: '2.00',
      ...overrides,
    },
  })
}

export async function createMenu() {
  const cat = await prisma.foodCategory.create({ data: { name: 'Snacks', slug: 'snacks' } })
  const samosa = await prisma.foodItem.create({
    data: { name: 'Samosa', slug: 'samosa', description: 'x', price: '15.00', categoryId: cat.id, prepTimeMinutes: 3 },
  })
  const sandwich = await prisma.foodItem.create({
    data: { name: 'Veg Sandwich', slug: 'veg-sandwich', description: 'x', price: '40.50', categoryId: cat.id, prepTimeMinutes: 8 },
  })
  const soldOut = await prisma.foodItem.create({
    data: { name: 'Brownie', slug: 'brownie', description: 'x', price: '45.00', categoryId: cat.id, isAvailable: false },
  })
  return { cat, samosa, sandwich, soldOut }
}

let n = 0
export async function createUser(opts: { studentId?: string; email?: string; status?: 'ACTIVE' | 'DEACTIVATED' } = {}) {
  const id = ++n
  const email = opts.email ?? `user${id}@college.edu`
  const user = await prisma.user.create({
    data: {
      email,
      name: `User ${id}`,
      role: 'USER',
      status: opts.status ?? 'ACTIVE',
      passwordHash: await pw(),
      userProfile: {
        create: {
          externalStudentId: opts.studentId ?? `TEST${id}`,
          integrationSource: 'test',
          enrollmentStatus: 'ENROLLED',
          enrollmentCheckedAt: new Date(),
        },
      },
    },
  })
  return { user, actor: { userId: user.id, role: 'USER', name: user.name, permissions: [] } as Actor }
}

export async function createCanteen(permissions: string[] = ['ORDERS', 'MENU', 'SETTINGS']) {
  const id = ++n
  const user = await prisma.user.create({
    data: {
      email: `canteen${id}@college.edu`,
      name: `Canteen ${id}`,
      role: 'CANTEEN',
      status: 'ACTIVE',
      passwordHash: await pw(),
      canteenProfile: { create: { permissions } },
    },
  })
  return { user, actor: { userId: user.id, role: 'CANTEEN', name: user.name, permissions } as Actor }
}

export async function createStaff(permissions: string[] = ['PAYMENTS', 'USERS', 'REPORTS']) {
  const id = ++n
  const user = await prisma.user.create({
    data: {
      email: `staff${id}@college.edu`,
      name: `Staff ${id}`,
      role: 'STAFF',
      status: 'ACTIVE',
      passwordHash: await pw(),
      staffProfile: { create: { permissions } },
    },
  })
  return { user, actor: { userId: user.id, role: 'STAFF', name: user.name, permissions } as Actor }
}

export function uuid() {
  return crypto.randomUUID()
}
