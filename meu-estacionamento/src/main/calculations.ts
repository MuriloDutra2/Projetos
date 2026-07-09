/**
 * Verifica se a estadia se qualifica como pernoite (18h às 08h).
 * Pernoite: entrada entre 18h e 23:59, saída entre 00h e 08h do dia seguinte.
 */
export function isPernoite(entrada: string, saida: string): boolean {
  const e = new Date(entrada)
  const s = new Date(saida)
  const he = e.getHours() * 60 + e.getMinutes()
  const hs = s.getHours() * 60 + s.getMinutes()
  const diffMs = s.getTime() - e.getTime()
  if (diffMs <= 0) return false
  const diffDias = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (diffDias === 0) return false
  return he >= 18 * 60 && hs <= 8 * 60
}

/** Chave YYYY-MM-DD do calendário local (ex.: Brasília no PC do estacionamento). */
export function localDateKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Divide a estadia em segmentos por dia civil local (meia-noite local).
 * Cada segmento recebe os minutos daquele dia para aplicar a cota diária de minutos grátis.
 */
export function splitStayIntoLocalDaySegments(entradaIso: string, saidaIso: string): { dateKey: string; minutes: number }[] {
  const e = new Date(entradaIso)
  const s = new Date(saidaIso)
  if (!(s > e)) return []
  const segments: { dateKey: string; minutes: number }[] = []
  let t = new Date(e.getTime())
  while (t < s) {
    const y = t.getFullYear()
    const mo = t.getMonth()
    const d = t.getDate()
    const dateKey = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const nextDay = new Date(y, mo, d + 1, 0, 0, 0, 0)
    const segmentEnd = s.getTime() < nextDay.getTime() ? s : nextDay
    const mins = Math.floor((segmentEnd.getTime() - t.getTime()) / (60 * 1000))
    if (mins > 0) segments.push({ dateKey, minutes: mins })
    t = new Date(segmentEnd.getTime())
  }
  return segments
}

export type GetDailyUsedForDate = (dateKey: string) => number

/**
 * Calcula o valor a ser cobrado baseado no tempo decorrido.
 *
 * Cota ÚNICA por estadia: a estadia contínua tem uma só cota de minutos
 * grátis, descontado o que já foi usado no dia civil da ENTRADA. A meia-noite
 * NÃO renova a cota da estadia em andamento (Fase 8, aprovada pela gerência em
 * 09/07/2026 — antes, quem entrava às 23h ganhava nova cota à meia-noite e
 * saía grátis até 01:30 com o pátio em vermelho). O rateio por dia civil
 * (splitStayIntoLocalDaySegments) segue usado apenas para REGISTRAR o uso em
 * daily_free_usage — o anti-fraude de reentrada não muda.
 *
 * @param getDailyUsedForDate - minutos já usados na data local YYYY-MM-DD (anti-fraude)
 * @param aplicarPernoite - Se true e estadia 18h-08h, cobra R$50 fixo
 */
export function calcularValor(
  entrada: string,
  freeMinutes: number = 90,
  saida: string | undefined,
  getDailyUsedForDate: GetDailyUsedForDate,
  aplicarPernoite: boolean = false
): number {
  const saidaDate = saida ? new Date(saida) : new Date()

  if (aplicarPernoite && saida && isPernoite(entrada, saida)) {
    return 50
  }

  const entradaDate = new Date(entrada)
  const totalMinutes = Math.floor((saidaDate.getTime() - entradaDate.getTime()) / 60000)
  if (totalMinutes <= 0) return 0

  const used = getDailyUsedForDate(localDateKeyFromDate(entradaDate))
  const effFree = Math.max(0, freeMinutes - used)
  const totalBillable = Math.max(0, totalMinutes - effFree)

  if (totalBillable <= 0) return 0
  const horasExtras = Math.ceil(totalBillable / 60)
  return horasExtras * 4
}

/**
 * Retorna os minutos utilizados nesta estadia (para registro no daily_free_usage).
 */
export function minutosDaEstadia(entrada: string, saida: string): number {
  const e = new Date(entrada)
  const s = new Date(saida)
  return Math.floor((s.getTime() - e.getTime()) / (1000 * 60))
}
