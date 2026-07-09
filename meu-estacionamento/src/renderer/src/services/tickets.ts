import type { Ticket, SubscriptionInfo } from '../types/domain'

export async function getTickets(): Promise<Ticket[]> {
  return window.api.getTickets()
}

export async function createTicket(data: {
  placa: string
  tipo: string
}): Promise<{
  success: boolean
  id?: number
  entrada?: string
  billedAsAvulso?: boolean
  error?: string
  message?: string
}> {
  return window.api.createTicket(data)
}

export async function checkoutTicket(data: {
  id: number
  paymentMethod?: string
}): Promise<{ success: boolean; valor?: number; error?: string }> {
  return window.api.checkoutTicket(data)
}

export async function calculateValue(data: {
  entrada: string
  placa?: string
  tipo?: string
  cpf?: string
}): Promise<{ valor: number }> {
  return window.api.calculateValue(data)
}

export async function checkPlateSubscription(
  placa: string
): Promise<SubscriptionInfo & { clientName: string; isSubscriber: boolean; isDebtor: boolean }> {
  return window.api.checkPlateSubscription(placa)
}

export async function checkPlateWasInToday(placa: string): Promise<boolean> {
  return window.api.checkPlateWasInToday(placa)
}

export async function excludeTicket(data: {
  id: number
  password: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.excludeTicket(data)
}

export async function excludeAllActiveTickets(data: {
  password: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.excludeAllActiveTickets(data)
}
