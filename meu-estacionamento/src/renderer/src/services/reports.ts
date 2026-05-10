export async function getHistory(): Promise<any[]> {
  return window.api.getHistory()
}

export async function getHistoryForDay(dateStr: string): Promise<any[]> {
  return window.api.getHistoryForDay(dateStr)
}

export async function getHistoryLast24h(): Promise<any[]> {
  return window.api.getHistoryLast24h()
}

export async function getDailyReport(dateStr: string): Promise<{
  totalAvulsos: number
  planosVendidosCount: number
  planosVendidosValue: number
  saved: { qtyCars: number; qtyMotos: number; createdAt: string } | null
}> {
  return window.api.getDailyReport(dateStr)
}

export async function saveDailyReport(data: {
  dateStr: string
  totalAvulsos: number
  planosVendidosCount: number
  planosVendidosValue: number
  qtyCars: number
  qtyMotos: number
}): Promise<{ success: boolean; error?: string }> {
  return window.api.saveDailyReport(data)
}

export async function exportDailyReportPdf(data: {
  dateStr: string
  totalAvulsos: number
  planosVendidosCount: number
  planosVendidosValue: number
  qtyCars: number
  qtyMotos: number
  savedAt?: string
}): Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }> {
  return window.api.exportDailyReportPdf(data)
}

export async function getExcludedTickets(): Promise<{
  id: number
  placa: string
  tipo: string
  entrada: string
  saida: string
}[]> {
  return window.api.getExcludedTickets()
}

export async function excludeAllActiveTickets(data: {
  password: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.excludeAllActiveTickets(data)
}
