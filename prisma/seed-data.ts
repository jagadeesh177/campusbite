// Demo seed data (development only). Prices in INR.

export const CATEGORIES = [
  { name: 'Breakfast', slug: 'breakfast', description: 'Fresh South & North Indian breakfast', sortOrder: 1, tint: ['#FEF3C7', '#FDE68A'] },
  { name: 'Meals', slug: 'meals', description: 'Filling lunch plates and rice bowls', sortOrder: 2, tint: ['#DCFCE7', '#BBF7D0'] },
  { name: 'Snacks', slug: 'snacks', description: 'Quick bites between classes', sortOrder: 3, tint: ['#FFE4E6', '#FECDD3'] },
  { name: 'Beverages', slug: 'beverages', description: 'Chai, coffee and coolers', sortOrder: 4, tint: ['#E0F2FE', '#BAE6FD'] },
  { name: 'Fast Food', slug: 'fast-food', description: 'Burgers, noodles and street favourites', sortOrder: 5, tint: ['#FFEDD5', '#FED7AA'] },
  { name: 'Desserts', slug: 'desserts', description: 'Something sweet', sortOrder: 6, tint: ['#F3E8FF', '#E9D5FF'] },
] as const

export type CategorySlug = (typeof CATEGORIES)[number]['slug']

export interface SeedFood {
  name: string
  slug: string
  description: string
  price: string
  category: CategorySlug
  isVeg: boolean
  prepTimeMinutes: number
  isPopular?: boolean
  isAvailable?: boolean
  emoji: string
}

export const FOODS: SeedFood[] = [
  { name: 'Idli (2 pcs)', slug: 'idli', description: 'Steamed rice cakes with sambar and coconut chutney.', price: '30.00', category: 'breakfast', isVeg: true, prepTimeMinutes: 5, emoji: '🍚' },
  { name: 'Masala Dosa', slug: 'masala-dosa', description: 'Crisp dosa with spiced potato filling, sambar and chutney.', price: '40.00', category: 'breakfast', isVeg: true, prepTimeMinutes: 10, isPopular: true, emoji: '🥞' },
  { name: 'Poha', slug: 'poha', description: 'Flattened rice with peanuts, curry leaves and lemon.', price: '25.00', category: 'breakfast', isVeg: true, prepTimeMinutes: 5, emoji: '🍛' },
  { name: 'Medu Vada (2 pcs)', slug: 'medu-vada', description: 'Crunchy lentil fritters with sambar.', price: '30.00', category: 'breakfast', isVeg: true, prepTimeMinutes: 7, emoji: '🍩' },

  { name: 'Veg Thali', slug: 'veg-thali', description: 'Rice, dal, two sabzis, 2 rotis, curd and pickle.', price: '80.00', category: 'meals', isVeg: true, prepTimeMinutes: 8, isPopular: true, emoji: '🍱' },
  { name: 'Veg Fried Rice', slug: 'veg-fried-rice', description: 'Wok-tossed rice with fresh vegetables.', price: '60.00', category: 'meals', isVeg: true, prepTimeMinutes: 12, emoji: '🍚' },
  { name: 'Chicken Fried Rice', slug: 'chicken-fried-rice', description: 'Wok-tossed rice with egg and chicken.', price: '90.00', category: 'meals', isVeg: false, prepTimeMinutes: 14, emoji: '🍗' },
  { name: 'Chicken Biryani', slug: 'chicken-biryani', description: 'Dum-cooked biryani with raita and salan.', price: '110.00', category: 'meals', isVeg: false, prepTimeMinutes: 10, isPopular: true, emoji: '🍲' },

  { name: 'Samosa', slug: 'samosa', description: 'Crispy pastry with spiced potato and peas.', price: '15.00', category: 'snacks', isVeg: true, prepTimeMinutes: 3, isPopular: true, emoji: '🥟' },
  { name: 'Veg Sandwich', slug: 'veg-sandwich', description: 'Grilled sandwich with veggies and mint chutney.', price: '40.00', category: 'snacks', isVeg: true, prepTimeMinutes: 8, emoji: '🥪' },
  { name: 'Chicken Sandwich', slug: 'chicken-sandwich', description: 'Grilled sandwich with tandoori chicken.', price: '70.00', category: 'snacks', isVeg: false, prepTimeMinutes: 10, emoji: '🥪' },

  { name: 'Tea', slug: 'tea', description: 'Classic masala chai.', price: '10.00', category: 'beverages', isVeg: true, prepTimeMinutes: 3, isPopular: true, emoji: '🍵' },
  { name: 'Coffee', slug: 'coffee', description: 'Hot filter coffee.', price: '20.00', category: 'beverages', isVeg: true, prepTimeMinutes: 3, emoji: '☕' },
  { name: 'Fresh Lime Soda', slug: 'fresh-lime-soda', description: 'Sweet, salted or mixed — your call.', price: '30.00', category: 'beverages', isVeg: true, prepTimeMinutes: 3, emoji: '🍋' },
  { name: 'Cold Coffee', slug: 'cold-coffee', description: 'Thick blended coffee with ice.', price: '40.00', category: 'beverages', isVeg: true, prepTimeMinutes: 5, emoji: '🥤' },

  { name: 'Veg Burger', slug: 'veg-burger', description: 'Crispy veg patty with lettuce and mayo.', price: '50.00', category: 'fast-food', isVeg: true, prepTimeMinutes: 8, emoji: '🍔' },
  { name: 'Veg Hakka Noodles', slug: 'veg-hakka-noodles', description: 'Indo-Chinese noodles with vegetables.', price: '55.00', category: 'fast-food', isVeg: true, prepTimeMinutes: 10, emoji: '🍜' },
  { name: 'Pav Bhaji', slug: 'pav-bhaji', description: 'Buttery mashed vegetable curry with soft pav.', price: '50.00', category: 'fast-food', isVeg: true, prepTimeMinutes: 7, emoji: '🍛' },

  { name: 'Gulab Jamun (2 pcs)', slug: 'gulab-jamun', description: 'Soft milk dumplings in warm sugar syrup.', price: '30.00', category: 'desserts', isVeg: true, prepTimeMinutes: 2, emoji: '🍡' },
  { name: 'Chocolate Brownie', slug: 'chocolate-brownie', description: 'Fudgy brownie, baked fresh daily.', price: '45.00', category: 'desserts', isVeg: true, prepTimeMinutes: 2, isAvailable: false, emoji: '🍫' },
]

// Demo account password policy-compliant passwords. Documented in README
// (development only) — never shown on login pages.
export const DEMO_PASSWORDS = {
  user: 'Student@123', // demo password kept as-is so existing demo accounts still sign in
  staff: 'Staff@123',
  canteen: 'Canteen@123',
} as const

export const STAFF_ACCOUNTS = [
  {
    email: 'admin@college.edu',
    name: 'Priya Menon',
    title: 'Canteen Administrator',
    permissions: ['STUDENTS', 'CANTEEN_ACCOUNTS', 'STAFF_ACCOUNTS', 'FOOD', 'PAYMENTS', 'REPORTS', 'AUDIT', 'SETTINGS'],
  },
  {
    email: 'finance@college.edu',
    name: 'Suresh Kumar',
    title: 'Accounts Officer',
    permissions: ['STUDENTS', 'PAYMENTS', 'REPORTS', 'AUDIT'],
  },
]

export const CANTEEN_ACCOUNTS = [
  { email: 'kitchen@college.edu', name: 'Ramesh Yadav', counterName: 'Main Kitchen', permissions: ['ORDERS', 'MENU', 'SETTINGS'] },
  { email: 'counter@college.edu', name: 'Lakshmi Devi', counterName: 'Pickup Counter', permissions: ['ORDERS'] },
]
