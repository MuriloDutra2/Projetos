/**
 * Conversão de dia/mês do calendário local para intervalos ISO UTC meio-abertos.
 *
 * As datas dos tickets e pagamentos são gravadas em ISO UTC (`toISOString()`).
 * Comparar `date(coluna)` no SQLite extrai a data UTC — no Brasil (UTC-3), tudo
 * que acontece entre 21:00 e 23:59 locais "vira" para o dia seguinte nos
 * relatórios. Estes helpers produzem intervalos [início, fim) em ISO UTC a
 * partir do dia/mês local; a comparação lexicográfica `coluna >= ? AND
 * coluna < ?` é segura porque todas as linhas usam o mesmo formato ISO.
 */

/** Intervalo ISO UTC [início, fim) do dia civil local. dateStr = YYYY-MM-DD */
export function localDayToIsoRange(dateStr: string): { start: string; end: string } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const start = new Date(y, m - 1, d, 0, 0, 0, 0)
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Intervalo ISO UTC [início, fim) do mês civil local. ym = YYYY-MM */
export function localMonthToIsoRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number)
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m, 1, 0, 0, 0, 0)
  return { start: start.toISOString(), end: end.toISOString() }
}
