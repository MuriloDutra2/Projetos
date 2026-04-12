/** Dia de cobrança efetivo no mês (ex.: 31 vira 28/29 em fevereiro). */
export function effectiveBillingDayInMonth(year: number, monthIndex: number, billingDay: number): number {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return Math.min(Math.max(1, billingDay), lastDay)
}
