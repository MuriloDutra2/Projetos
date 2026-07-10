/**
 * Regras puras de status financeiro do cliente (mensalista/garagem).
 *
 * Caso real (vídeo 09/07/2026): cliente pagou, vencimento futuro na tela,
 * mas o status mostrava "A vencer"/"Em atraso" porque a regra antiga só
 * olhava pagamento com competência do mês-calendário atual. Consequência:
 * o veículo entrava como avulso e gerava cobrança fantasma (quebra de caixa).
 */

import { localDateKeyFromDate } from './calculations'

/**
 * YYYY-MM-DD do calendário local — alias do helper do motor de cobrança.
 * Fonte única: divergência entre duas implementações de "dia local"
 * reintroduziria exatamente a classe de bug de fuso corrigida nesta branch.
 */
export const localDateStr = localDateKeyFromDate

/** YYYY-MM do calendário local. */
export function localMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Cliente coberto hoje se QUALQUER uma valer:
 * 1. vencimento (expiry_date) é hoje ou futuro;
 * 2. maior competência paga cobre o mês atual (inclui pagamento adiantado);
 * 3. existe pagamento lançado no mês atual (regra antiga, mantida como rede).
 */
export function isCoveredNow(params: {
  expiryDate?: string | null
  maxPaidCompetency?: string | null
  paidCurrentMonth: boolean
  now: Date
}): boolean {
  const exp = (params.expiryDate || '').slice(0, 10)
  if (exp && exp >= localDateStr(params.now)) return true
  if (params.maxPaidCompetency && params.maxPaidCompetency >= localMonthKey(params.now)) return true
  return params.paidCurrentMonth
}

export type FinancialStatus = 'Em dia' | 'A vencer' | 'Vence hoje' | 'Em atraso'

/**
 * Status exibido na tabela de clientes. Cliente coberto é sempre "Em dia";
 * só quem não tem cobertura entra na régua do dia de vencimento.
 */
export function financialStatusFor(covered: boolean, dueDay: number, today: Date): FinancialStatus {
  if (covered) return 'Em dia'
  const day = today.getDate()
  if (day > dueDay) return 'Em atraso'
  if (day === dueDay) return 'Vence hoje'
  return 'A vencer'
}
