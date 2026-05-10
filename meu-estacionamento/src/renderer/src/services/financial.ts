export async function getFinancialHistory(): Promise<any[]> {
  return window.api.getFinancialHistory()
}

export async function getFinancialSummaryByMethod(data: {
  month: number
  year: number
}): Promise<{ payment_method: string; total: number }[]> {
  return window.api.getFinancialSummaryByMethod(data)
}

export async function exportFinancialCsv(): Promise<{
  success: boolean
  path?: string
  canceled?: boolean
  error?: string
}> {
  return window.api.exportFinancialCsv()
}
