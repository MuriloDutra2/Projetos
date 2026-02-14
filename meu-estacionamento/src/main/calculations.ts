/**
 * Calcula o valor a ser cobrado baseado no tempo decorrido.
 * @param entrada - Data/hora de entrada (ISO string)
 * @param freeMinutes - Minutos grátis (default 90 para avulso; 150 mensal, 720 funcionário)
 * Acima de freeMinutes: R$ 4,00 por hora (ou fração).
 */
export function calcularValor(entrada: string, freeMinutes: number = 90): number {
  const entradaDate = new Date(entrada)
  const agora = new Date()
  const diffMs = agora.getTime() - entradaDate.getTime()
  const diffMinutos = Math.floor(diffMs / (1000 * 60))

  if (diffMinutos <= freeMinutes) {
    return 0
  }

  const minutosExtras = diffMinutos - freeMinutes
  const horasExtras = Math.ceil(minutosExtras / 60)
  return horasExtras * 4
}
