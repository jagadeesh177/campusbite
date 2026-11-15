import 'server-only'
import { db } from '@/lib/db'
import { rupeesToPaise } from '@/lib/money'

export async function getMenuAdmin() {
  const categories = await db.foodCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { items: { orderBy: { name: 'asc' } } },
  })
  return {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      itemCount: c.items.length,
    })),
    items: categories.flatMap((c) =>
      c.items.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        price: i.price.toFixed(2),
        pricePaise: rupeesToPaise(i.price),
        imageUrl: i.imageUrl,
        isVeg: i.isVeg,
        isAvailable: i.isAvailable,
        isPopular: i.isPopular,
        prepTimeMinutes: i.prepTimeMinutes,
        categoryId: c.id,
        categoryName: c.name,
        categoryActive: c.isActive,
      })),
    ),
  }
}

export type MenuAdminData = Awaited<ReturnType<typeof getMenuAdmin>>
