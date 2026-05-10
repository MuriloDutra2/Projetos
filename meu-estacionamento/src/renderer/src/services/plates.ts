import type { SubscriptionInfo } from '../types/domain'

export async function checkPlateSubscription(
  placa: string
): Promise<SubscriptionInfo & { clientName: string; isSubscriber: boolean; isDebtor: boolean }> {
  return window.api.checkPlateSubscription(placa)
}

export async function checkPlateWasInToday(placa: string): Promise<boolean> {
  return window.api.checkPlateWasInToday(placa)
}
