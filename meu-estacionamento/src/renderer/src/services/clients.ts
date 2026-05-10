import type { ClientRow, ClientStatement } from '../types/domain'

export async function getClients(): Promise<ClientRow[]> {
  return window.api.getClients()
}

export async function createClient(data: {
  name: string
  cpf: string
  phone: string
  plan_type: string
  expiry_date: string
  plates: string[]
  garage_billing_day?: number | null
  garage_billing_month?: number | null
}): Promise<{ success: boolean; id?: number; error?: string }> {
  return window.api.createClient(data)
}

export async function updateClient(data: {
  id: number
  name: string
  cpf: string
  phone: string
  plan_type: string
  expiry_date: string
  plates: string[]
  garage_billing_day?: number | null
  garage_billing_month?: number | null
}): Promise<{ success: boolean; error?: string }> {
  return window.api.updateClient(data)
}

export async function toggleClientStatus(data: {
  clientId: number
  active: number
}): Promise<{ success: boolean; error?: string }> {
  return window.api.toggleClientStatus(data)
}

export async function deleteClient(data: {
  clientId: number
  password: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.deleteClient(data)
}

export async function getClientStatement(clientId: number): Promise<ClientStatement | null> {
  return window.api.getClientStatement(clientId)
}

export async function renewSubscription(data: {
  clientId: number
  planType: string
  amount: number
  months?: number
  paymentMethod?: string
  notes?: string
}): Promise<{ success: boolean; newExpiry?: string; error?: string }> {
  return window.api.renewSubscription(data)
}
