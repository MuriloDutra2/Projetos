export interface Ticket {
  id: number
  placa: string
  tipo: string
  entrada: string
  status: string
  cpf?: string | null
}

export interface HistoryEntry {
  id: number
  placa: string
  tipo: string
  entrada: string
  saida: string
  valor: number
}

export interface ClientRow {
  id: number
  name: string
  cpf?: string
  phone?: string
  plan_type: string
  expiry_date: string
  status: string
  plates: string[]
  isExpired: boolean
  isDebtor?: boolean
  lastPaymentDate?: string | null
  lastPaymentCompetency?: string | null
  financialStatus?: 'Em dia' | 'Vence hoje' | 'A vencer' | 'Em atraso' | string
  garage_billing_day?: number | null
  garage_billing_month?: number | null
  garageBillingLabel?: string | null
}

export interface SubscriptionInfo {
  isSubscriber: boolean
  clientName: string
  planType: string
  isExpired: boolean
  expiryDate: string
  freeMinutes: number
  isDebtor?: boolean
  clientId?: number
}

export interface ClientStatement {
  client: { id: number; name: string; plan_type: string }
  payments: {
    id: number
    amount: number
    payment_date: string
    payment_method: string
    competency_month?: string | null
    is_advance: number
  }[]
  avulsoWhileDebtor: { id: number; placa: string; tipo: string; entrada: string; saida: string | null; valor: number }[]
  totals: { payments: number; avulsos: number }
}

export type View = 'inicio' | 'historico' | 'relatorio' | 'mensalistas' | 'familias' | 'financeiro' | 'excluidos' | 'configuracoes'
