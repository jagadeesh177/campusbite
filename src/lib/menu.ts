import 'server-only'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AppError } from '@/lib/errors'
import { publishEvent } from '@/lib/realtime/publish'
import { parseHHMM } from '@/lib/time'
import type { Actor } from '@/lib/auth/guards'

export function canManageMenu(actor: Actor) {
  return (actor.role === 'CANTEEN' && actor.permissions.includes('MENU')) || (actor.role === 'STAFF' && actor.permissions.includes('FOOD'))
}
export function canManageSettings(actor: Actor) {
  return (actor.role === 'CANTEEN' || actor.role === 'STAFF') && actor.permissions.includes('SETTINGS')
}
function assertMenu(actor: Actor) {
  if (!canManageMenu(actor)) throw new AppError('FORBIDDEN', 'You do not have permission to manage the menu.')
}

const bool = z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean())

export const foodItemSchema = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(2, 'Name is too short').max(60),
  description: z.string().trim().min(2, 'Add a short description').max(240),
  price: z
    .string()
    .trim()
    .regex(/^\d{1,5}(\.\d{1,2})?$/, 'Enter a price like 45 or 45.50')
    .refine((v) => Number(v) > 0 && Number(v) <= 10000, 'Price must be between ₹0.01 and ₹10,000'),
  categoryId: z.string().min(1, 'Choose a category'),
  prepTimeMinutes: z.coerce.number().int().min(1).max(120),
  isVeg: bool,
  isAvailable: bool,
  isPopular: bool,
})

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50) || 'item'
}

// ---------------------------------------------------------------------------
// Images (stored in Postgres; validated by content, not by the client's claim)
// ---------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 1_500_000

function sniffImageType(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

export async function storeFoodImage(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new AppError('VALIDATION', 'Photo must be smaller than 1.5 MB.')
  const data = Buffer.from(await file.arrayBuffer())
  const mimeType = sniffImageType(data)
  if (!mimeType) throw new AppError('VALIDATION', 'Upload a JPEG, PNG or WebP photo.')
  const img = await db.foodImage.create({ data: { data, mimeType, size: data.length } })
  return `/api/images/${img.id}`
}

// ---------------------------------------------------------------------------
// Items & categories
// ---------------------------------------------------------------------------

export async function saveFoodItem(actor: Actor, input: z.input<typeof foodItemSchema>, image?: File | null) {
  assertMenu(actor)
  const parsed = foodItemSchema.safeParse(input)
  if (!parsed.success) {
    throw Object.assign(new AppError('VALIDATION', 'Please check the highlighted fields.'), {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }
  const d = parsed.data
  const category = await db.foodCategory.findUnique({ where: { id: d.categoryId } })
  if (!category) throw new AppError('VALIDATION', 'Choose a valid category.')
  const imageUrl = image && image.size > 0 ? await storeFoodImage(image) : undefined

  const data = {
    name: d.name,
    description: d.description,
    price: d.price,
    categoryId: d.categoryId,
    prepTimeMinutes: d.prepTimeMinutes,
    isVeg: d.isVeg,
    isAvailable: d.isAvailable,
    isPopular: d.isPopular,
    ...(imageUrl ? { imageUrl } : {}),
  }

  const saved = await db.$transaction(async (tx) => {
    if (d.id) {
      const before = await tx.foodItem.findUnique({ where: { id: d.id } })
      if (!before) throw new AppError('NOT_FOUND', 'Item not found.')
      const item = await tx.foodItem.update({ where: { id: d.id }, data })
      await audit(
        {
          actor,
          action: 'menu.item_updated',
          entityType: 'FoodItem',
          entityId: item.id,
          metadata: {
            name: item.name,
            ...(before.price.toString() !== item.price.toString() ? { priceFrom: before.price.toString(), priceTo: item.price.toString() } : {}),
            ...(before.isAvailable !== item.isAvailable ? { available: item.isAvailable } : {}),
          },
        },
        tx,
      )
      return item
    }
    let slug = slugify(d.name)
    if (await tx.foodItem.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`
    const item = await tx.foodItem.create({ data: { ...data, slug } })
    await audit({ actor, action: 'menu.item_created', entityType: 'FoodItem', entityId: item.id, metadata: { name: item.name, price: d.price } }, tx)
    return item
  })
  await publishEvent(db, { type: 'MENU_UPDATED', forCanteen: true, forStaff: true, payload: { itemId: saved.id } })
  return saved
}

export async function setItemAvailability(actor: Actor, itemId: string, isAvailable: boolean) {
  assertMenu(actor)
  const item = await db.foodItem.update({ where: { id: itemId }, data: { isAvailable } }).catch(() => null)
  if (!item) throw new AppError('NOT_FOUND', 'Item not found.')
  await audit({ actor, action: isAvailable ? 'menu.item_available' : 'menu.item_sold_out', entityType: 'FoodItem', entityId: itemId, metadata: { name: item.name } })
  await publishEvent(db, { type: 'MENU_UPDATED', forCanteen: true, forStaff: true, payload: { itemId } })
  return item
}

export const categorySchema = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(120).optional().transform((v) => v || null),
  sortOrder: z.coerce.number().int().min(0).max(999),
  isActive: bool,
})

export async function saveCategory(actor: Actor, input: z.input<typeof categorySchema>) {
  assertMenu(actor)
  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid category')
  const d = parsed.data
  const clash = await db.foodCategory.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, NOT: d.id ? { id: d.id } : undefined } })
  if (clash) throw new AppError('CONFLICT', 'A category with this name already exists.')
  const data = { name: d.name, description: d.description, sortOrder: d.sortOrder, isActive: d.isActive }
  const cat = d.id
    ? await db.foodCategory.update({ where: { id: d.id }, data })
    : await db.foodCategory.create({ data: { ...data, slug: `${slugify(d.name)}-${Date.now().toString(36).slice(-4)}` } })
  await audit({ actor, action: d.id ? 'menu.category_updated' : 'menu.category_created', entityType: 'FoodCategory', entityId: cat.id, metadata: { name: cat.name, isActive: cat.isActive } })
  return cat
}

// ---------------------------------------------------------------------------
// Kitchen settings
// ---------------------------------------------------------------------------

const hhmm = z.string().refine((v) => {
  try {
    parseHHMM(v)
    return true
  } catch {
    return false
  }
}, 'Use HH:mm')

export const kitchenSettingsSchema = z
  .object({
    acceptingOrders: bool,
    pauseMessage: z.string().trim().max(140).optional().transform((v) => v || null),
    defaultPrepMinutes: z.coerce.number().int().min(1).max(120),
    maxConcurrentOrders: z.coerce.number().int().min(1).max(500),
    pickupSlotMinutes: z.coerce.number().int().min(5).max(120),
    openingTime: hhmm,
    closingTime: hhmm,
    convenienceFee: z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Enter a fee like 0, 2 or 2.50'),
  })
  .refine((v) => parseHHMM(v.closingTime) > parseHHMM(v.openingTime), {
    message: 'Closing time must be after opening time',
    path: ['closingTime'],
  })

export async function updateKitchenSettings(actor: Actor, input: z.input<typeof kitchenSettingsSchema>) {
  if (!canManageSettings(actor)) throw new AppError('FORBIDDEN', 'You do not have permission to change kitchen settings.')
  const parsed = kitchenSettingsSchema.safeParse(input)
  if (!parsed.success) {
    throw Object.assign(new AppError('VALIDATION', 'Please check the highlighted fields.'), {
      fieldErrors: parsed.error.flatten().fieldErrors,
    })
  }
  const settings = await db.kitchenSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...parsed.data, updatedById: actor.userId },
    update: { ...parsed.data, updatedById: actor.userId },
  })
  await audit({ actor, action: 'kitchen.settings_updated', entityType: 'KitchenSettings', entityId: 'default', metadata: parsed.data })
  await publishEvent(db, { type: 'KITCHEN_UPDATED', forCanteen: true, forStaff: true, payload: { acceptingOrders: settings.acceptingOrders } })
  return settings
}
