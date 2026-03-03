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

/**
 * Calcula o valor a ser cobrado baseado no tempo decorrido.
 * @param entrada - Data/hora de entrada (ISO string)
 * @param freeMinutes - Minutos grátis (default 90 avulso; 150 mensal; 720 funcionário; 999999 garagem)
 * @param saida - Data/hora de saída (opcional, para checkout)
 * @param dailyUsedMinutes - Minutos já usados no dia (controle anti-fraude)
 * @param aplicarPernoite - Se true e estadia 18h-08h, cobra R$50 fixo
 * Acima de freeMinutes: R$ 4,00 por hora (ou fração).
 */
export function calcularValor(
  entrada: string,
  freeMinutes: number = 90,
  saida?: string,
  dailyUsedMinutes: number = 0,
  aplicarPernoite: boolean = false
): number {
  const saidaDate = saida ? new Date(saida) : new Date()
  const entradaDate = new Date(entrada)

  if (aplicarPernoite && saida && isPernoite(entrada, saida)) {
    return 50
  }

  const effectiveFree = Math.max(0, freeMinutes - dailyUsedMinutes)
  const diffMs = saidaDate.getTime() - entradaDate.getTime()
  const diffMinutos = Math.floor(diffMs / (1000 * 60))

  if (diffMinutos <= effectiveFree) {
    return 0
  }

  const minutosExtras = diffMinutos - effectiveFree
  const horasExtras = Math.ceil(minutosExtras / 60)
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
