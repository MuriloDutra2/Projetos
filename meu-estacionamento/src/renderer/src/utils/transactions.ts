/**
 * Mescla tickets avulsos e pagamentos de renovação em uma lista única de
 * transações, com formato de descrição ÚNICO — a mesma transação deve ler
 * igual na aba Financeiro, na tela de Fechamento de caixa e no CSV.
 */

export interface MixedTransaction {
  date: string
  type: 'avulso' | 'renovacao'
  description: string
  value: number
}

interface TicketLike {
  placa: string
  saida: string
  valor: number | null
  payment_method?: string | null
}

interface PaymentLike {
  client_name: string
  payment_date: string
  amount: number | null
  payment_method?: string | null
  competency_month?: string | null
}

export function describeTicket(t: TicketLike): string {
  return `Ticket ${t.placa}${t.payment_method ? ` (${t.payment_method})` : ''}`
}

export function describePayment(p: PaymentLike): string {
  return `${p.client_name}${p.payment_method ? ` (${p.payment_method})` : ''}${
    p.competency_month ? ` - comp. ${p.competency_month}` : ''
  }`
}

export function mergeTransactions(tickets: TicketLike[], payments: PaymentLike[]): MixedTransaction[] {
  return [
    ...tickets.map((t) => ({
      date: t.saida,
      type: 'avulso' as const,
      description: describeTicket(t),
      value: t.valor ?? 0
    })),
    ...payments.map((p) => ({
      date: p.payment_date,
      type: 'renovacao' as const,
      description: describePayment(p),
      value: p.amount ?? 0
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
