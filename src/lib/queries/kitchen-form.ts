import 'server-only'
import { getKitchenSettings } from '@/lib/kitchen'
import type { KitchenSettingsValues } from '@/components/menu/kitchen-settings-form'

export async function getKitchenFormValues(): Promise<KitchenSettingsValues> {
  const s = await getKitchenSettings()
  return {
    acceptingOrders: s.acceptingOrders,
    pauseMessage: s.pauseMessage ?? '',
    defaultPrepMinutes: s.defaultPrepMinutes,
    maxConcurrentOrders: s.maxConcurrentOrders,
    pickupSlotMinutes: s.pickupSlotMinutes,
    openingTime: s.openingTime,
    closingTime: s.closingTime,
    convenienceFee: s.convenienceFee.toFixed(2),
  }
}
