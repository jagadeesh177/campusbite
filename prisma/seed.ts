/* eslint-disable no-console */
// Development seed. Wipes and recreates demo data. Refuses to run in production.
//   npx prisma db seed

import { PrismaClient, type FoodItem, type OrderStatus, type User } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { CATEGORIES, FOODS, DEMO_PASSWORDS, STAFF_ACCOUNTS, CANTEEN_ACCOUNTS } from './seed-data'
import { MOCK_COLLEGE_DIRECTORY } from '../src/lib/college/mock-provider'
import { generateOrderNumber, generatePickupToken } from '../src/lib/orders/codes'
import { paiseToDecimalString, rupeesToPaise } from '../src/lib/money'
import { startOfZonedDay } from '../src/lib/time'

const prisma = new PrismaClient()
const TZ = process.env.APP_TIMEZONE ?? 'Asia/Kolkata'

// Deterministic RNG so the demo data looks the same on every machine
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(20261115)
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1))

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refusing to seed demo data in production.')
  }

  console.log('Clearing existing data…')
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "RealtimeEvent", "Notification", "AuditLog", "OrderStatusHistory", "PickupToken",
      "Refund", "Payment", "WebhookEvent", "OrderItem", "Order", "FoodItem", "FoodImage", "FoodCategory",
      "Session", "VerificationCode", "DevMailMessage", "RateLimitBucket", "StudentProfile",
      "StaffProfile", "CanteenProfile", "User", "KitchenSettings" RESTART IDENTITY CASCADE`)

  await prisma.kitchenSettings.create({
    data: {
      id: 'default',
      acceptingOrders: true,
      maxConcurrentOrders: 40,
      defaultPrepMinutes: 12,
      pickupSlotMinutes: 15,
      openingTime: '08:00',
      closingTime: '20:00',
      convenienceFee: '2.00',
    },
  })

  // ---- Menu --------------------------------------------------------------
  const categoryIds = new Map<string, string>()
  for (const c of CATEGORIES) {
    const row = await prisma.foodCategory.create({
      data: { name: c.name, slug: c.slug, description: c.description, sortOrder: c.sortOrder },
    })
    categoryIds.set(c.slug, row.id)
  }
  const foods: FoodItem[] = []
  for (const f of FOODS) {
    foods.push(
      await prisma.foodItem.create({
        data: {
          name: f.name,
          slug: f.slug,
          description: f.description,
          price: f.price,
          imageUrl: `/food/${f.slug}.svg`,
          isVeg: f.isVeg,
          isPopular: f.isPopular ?? false,
          isAvailable: f.isAvailable ?? true,
          prepTimeMinutes: f.prepTimeMinutes,
          categoryId: categoryIds.get(f.category)!,
        },
      }),
    )
  }
  console.log(`Menu: ${CATEGORIES.length} categories, ${foods.length} items`)

  // ---- Accounts ----------------------------------------------------------
  const [studentHash, staffHash, canteenHash] = await Promise.all([
    bcrypt.hash(DEMO_PASSWORDS.student, 12),
    bcrypt.hash(DEMO_PASSWORDS.staff, 12),
    bcrypt.hash(DEMO_PASSWORDS.canteen, 12),
  ])
  const now = new Date()

  // First 10 enrolled students from the mock directory get active accounts;
  // the rest are left un-activated to demo the activation flow.
  const students: User[] = []
  for (const s of MOCK_COLLEGE_DIRECTORY.filter((s) => s.enrollmentStatus === 'ENROLLED').slice(0, 10)) {
    students.push(
      await prisma.user.create({
        data: {
          email: s.email,
          name: s.fullName,
          role: 'STUDENT',
          status: 'ACTIVE',
          passwordHash: studentHash,
          emailVerifiedAt: now,
          studentProfile: {
            create: {
              externalStudentId: s.studentId,
              integrationSource: 'mock',
              department: s.department,
              programme: s.programme,
              yearOfStudy: s.yearOfStudy,
              enrollmentStatus: 'ENROLLED',
              enrollmentCheckedAt: now,
              dietaryPreference: 'NO_PREFERENCE',
            },
          },
        },
      }),
    )
  }
  for (const s of STAFF_ACCOUNTS) {
    await prisma.user.create({
      data: {
        email: s.email,
        name: s.name,
        role: 'STAFF',
        status: 'ACTIVE',
        passwordHash: staffHash,
        emailVerifiedAt: now,
        staffProfile: { create: { title: s.title, permissions: s.permissions } },
      },
    })
  }
  const canteenUsers: User[] = []
  for (const c of CANTEEN_ACCOUNTS) {
    canteenUsers.push(
      await prisma.user.create({
        data: {
          email: c.email,
          name: c.name,
          role: 'CANTEEN',
          status: 'ACTIVE',
          passwordHash: canteenHash,
          emailVerifiedAt: now,
          canteenProfile: { create: { counterName: c.counterName, permissions: c.permissions } },
        },
      }),
    )
  }
  console.log(`Accounts: ${students.length} students, ${STAFF_ACCOUNTS.length} staff, ${CANTEEN_ACCOUNTS.length} canteen`)

  // ---- Order history (simulated payments, clearly marked) ----------------
  const available = foods.filter((f) => f.isAvailable)
  const usedNumbers = new Set<string>()
  const usedTokens = new Set<string>()
  let seq = 0
  const uniq = (gen: () => string, used: Set<string>) => {
    let v = gen()
    while (used.has(v)) v = gen()
    used.add(v)
    return v
  }

  async function makeOrder(opts: {
    createdAt: Date
    status: OrderStatus
    student?: (typeof students)[number]
  }) {
    seq++
    const student = opts.student ?? pick(students)
    const lineCount = between(1, 3)
    const chosen = new Map<string, { food: (typeof foods)[number]; qty: number }>()
    while (chosen.size < lineCount) {
      const food = pick(available)
      chosen.set(food.id, { food, qty: between(1, 2) })
    }
    const lines = [...chosen.values()].map(({ food, qty }) => {
      const unit = rupeesToPaise(food.price)
      return { food, qty, unit, total: unit * qty }
    })
    const subtotal = lines.reduce((a, l) => a + l.total, 0)
    const fees = 200
    const total = subtotal + fees
    const t = opts.createdAt.getTime()
    const at = (min: number) => new Date(t + min * 60_000)
    const paid = opts.status !== 'CANCELLED' && opts.status !== 'PAYMENT_PENDING'

    const flow: OrderStatus[] = ['PAYMENT_PENDING']
    if (opts.status === 'CANCELLED') flow.push('CANCELLED')
    else {
      const happy: OrderStatus[] = ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED']
      const target = opts.status === 'REFUNDED' || opts.status === 'REFUND_PENDING' ? 'CONFIRMED' : opts.status
      flow.push(...happy.slice(0, happy.indexOf(target) + 1))
      if (opts.status === 'REFUND_PENDING') flow.push('REFUND_PENDING')
      if (opts.status === 'REFUNDED') flow.push('REFUND_PENDING', 'REFUNDED')
    }

    const order = await prisma.order.create({
      data: {
        orderNumber: uniq(() => generateOrderNumber(opts.createdAt), usedNumbers),
        userId: student.id,
        status: opts.status,
        idempotencyKey: `seed-${seq}`,
        subtotal: paiseToDecimalString(subtotal),
        fees: paiseToDecimalString(fees),
        total: paiseToDecimalString(total),
        estimatedReadyAt: at(15),
        createdAt: opts.createdAt,
        confirmedAt: paid ? at(1) : null,
        acceptedAt: flow.includes('ACCEPTED') ? at(2) : null,
        readyAt: flow.includes('READY') ? at(12) : null,
        collectedAt: flow.includes('COLLECTED') ? at(18) : null,
        cancelledAt: opts.status === 'CANCELLED' ? at(30) : flow.includes('REFUND_PENDING') ? at(4) : null,
        cancelReason:
          opts.status === 'CANCELLED'
            ? 'Payment not completed in time'
            : flow.includes('REFUND_PENDING')
              ? 'Item ran out before preparation'
              : null,
        items: {
          create: lines.map((l) => ({
            foodItemId: l.food.id,
            nameSnapshot: l.food.name,
            unitPrice: paiseToDecimalString(l.unit),
            quantity: l.qty,
            lineTotal: paiseToDecimalString(l.total),
          })),
        },
        history: {
          create: flow.map((s, i) => ({
            fromStatus: i === 0 ? null : flow[i - 1],
            toStatus: s,
            actorRole: s === 'CONFIRMED' || s === 'CANCELLED' || s === 'REFUNDED' ? 'SYSTEM' : i === 0 ? 'STUDENT' : 'CANTEEN',
            changedById: ['ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'REFUND_PENDING'].includes(s)
              ? pick(canteenUsers).id
              : i === 0
                ? student.id
                : null,
            createdAt: at([0, 1, 2, 5, 12, 18][Math.min(i, 5)]),
          })),
        },
      },
    })

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'SIMULATOR',
        status: opts.status === 'REFUNDED' ? 'REFUNDED' : paid ? 'SUCCEEDED' : 'FAILED',
        amount: paiseToDecimalString(total),
        gatewayOrderId: `seed_order_${seq}`,
        gatewayPaymentId: paid ? `seed_pay_${seq}` : null,
        method: paid ? 'upi (simulated)' : null,
        verifiedVia: paid ? 'simulator' : null,
        verifiedAt: paid ? at(1) : null,
        failureReason: paid ? null : 'expired',
        createdAt: opts.createdAt,
      },
    })
    if (paid) {
      await prisma.pickupToken.create({
        data: {
          orderId: order.id,
          token: uniq(generatePickupToken, usedTokens),
          createdAt: at(1),
          usedAt: opts.status === 'COLLECTED' ? at(18) : null,
          verifiedById: opts.status === 'COLLECTED' ? pick(canteenUsers).id : null,
        },
      })
    }
    if (opts.status === 'REFUNDED' || opts.status === 'REFUND_PENDING') {
      await prisma.refund.create({
        data: {
          orderId: order.id,
          paymentId: payment.id,
          amount: paiseToDecimalString(total),
          reason: 'Item ran out before preparation',
          status: opts.status === 'REFUNDED' ? 'PROCESSED' : 'PENDING',
          gatewayRefundId: opts.status === 'REFUNDED' ? `seed_rfnd_${seq}` : null,
          processedAt: opts.status === 'REFUNDED' ? at(30) : null,
          createdAt: at(4),
        },
      })
    }
    return order
  }

  const todayStart = startOfZonedDay(now, TZ)
  for (let d = 21; d >= 1; d--) {
    const dayStart = todayStart.getTime() - d * 86_400_000
    const isWeekend = new Date(dayStart + 12 * 3_600_000).getUTCDay() % 6 === 0
    const count = isWeekend ? between(3, 7) : between(10, 20)
    for (let i = 0; i < count; i++) {
      const createdAt = new Date(dayStart + (8.5 + rand() * 8) * 3_600_000)
      const r = rand()
      const status: OrderStatus = r < 0.88 ? 'COLLECTED' : r < 0.96 ? 'CANCELLED' : 'REFUNDED'
      await makeOrder({ createdAt, status })
    }
  }

  // Today: some done, some live on the kitchen board
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)
  for (let i = 0; i < 6; i++) await makeOrder({ createdAt: minutesAgo(between(60, 240)), status: 'COLLECTED' })
  const [aarav, diya, rohan, ananya] = students
  await makeOrder({ createdAt: minutesAgo(14), status: 'READY', student: aarav })
  await makeOrder({ createdAt: minutesAgo(11), status: 'READY' })
  await makeOrder({ createdAt: minutesAgo(9), status: 'PREPARING', student: diya })
  await makeOrder({ createdAt: minutesAgo(8), status: 'PREPARING' })
  await makeOrder({ createdAt: minutesAgo(5), status: 'ACCEPTED', student: rohan })
  await makeOrder({ createdAt: minutesAgo(3), status: 'CONFIRMED', student: ananya })
  await makeOrder({ createdAt: minutesAgo(2), status: 'CONFIRMED' })
  await makeOrder({ createdAt: minutesAgo(40), status: 'REFUND_PENDING' })

  const total = await prisma.order.count()
  console.log(`Orders: ${total} (simulated payments, marked provider=SIMULATOR)`)
  console.log('Seed complete. Demo credentials are listed in README.md (development only).')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
