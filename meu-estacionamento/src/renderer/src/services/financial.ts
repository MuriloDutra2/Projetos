export interface FinanceMonthData {
  totalAvulsos: number
  countAvulsos: number
  totalRenovacoes: number
  countRenovacoes: number
  byMethod: { payment_method: string; total: number }[]
  tickets: { id: number; placa: string; tipo: string; entrada: string; saida: string; valor: number | null }[]
  payments: any[]
}

export async function getFinancialHistory(): Promise<any[]> {
  return window.api.getFinancialHistory()
}

export async function getFinancialSummaryByMethod(data: {
  month: number
  year: number
}): Promise<{ payment_method: string; total: number }[]> {
  return window.api.getFinancialSummaryByMethod(data)
}

/** Totais, quebra por método e transações do mês local — somados no SQL, sem LIMIT. */
export async function getFinanceMonthData(data: {
  month: number
  year: number
}): Promise<FinanceMonthData> {
  return window.api.getFinanceMonthData(data)
}

export async function exportFinancialCsv(data?: { month?: number; year?: number }): Promise<{
  success: boolean
  path?: string
  canceled?: boolean
  error?: string
}> {
  return window.api.exportFinancialCsv(data)
}
