// Permission catalogue (client-safe: labels only, no enforcement here).
// Enforcement happens server-side in src/lib/auth/guards.ts.

export const CANTEEN_PERMISSIONS = {
  ORDERS: 'Manage orders & pickups',
  MENU: 'Manage menu, prices & categories',
  SETTINGS: 'Kitchen settings & operating hours',
} as const

export const STAFF_PERMISSIONS = {
  STUDENTS: 'View & manage student access',
  CANTEEN_ACCOUNTS: 'Manage canteen operator accounts',
  STAFF_ACCOUNTS: 'Manage staff accounts',
  FOOD: 'Manage menu & categories',
  PAYMENTS: 'View payments & process refunds',
  REPORTS: 'View reports & export data',
  AUDIT: 'View audit logs',
  SETTINGS: 'Kitchen settings & operating hours',
} as const

export type CanteenPermission = keyof typeof CANTEEN_PERMISSIONS
export type StaffPermission = keyof typeof STAFF_PERMISSIONS
export type Permission = CanteenPermission | StaffPermission

export function isCanteenPermission(p: string): p is CanteenPermission {
  return p in CANTEEN_PERMISSIONS
}

export function isStaffPermission(p: string): p is StaffPermission {
  return p in STAFF_PERMISSIONS
}
