import { describe, it, expect } from 'vitest'
import { localDayToIsoRange, localMonthToIsoRange } from '../../src/main/dateRanges'

/** ISO UTC de um horário local, como o app grava (new Date(...).toISOString()) */
const isoLocal = (y: number, m: number, d: number, h: number, min = 0): string =>
  new Date(y, m - 1, d, h, min).toISOString()

describe('localDayToIsoRange', () => {
  it('retorna intervalo em formato ISO UTC', () => {
    const { start, end } = localDayToIsoRange('2026-07-09')
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(start < end).toBe(true)
  })

  it('saída às 22h local pertence ao dia local (caso que divergia com date() UTC)', () => {
    const { start, end } = localDayToIsoRange('2026-07-09')
    const saida22h = isoLocal(2026, 7, 9, 22, 30)
    expect(saida22h >= start && saida22h < end).toBe(true)
  })

  it('meia-noite local do dia seguinte fica fora (intervalo meio-aberto)', () => {
    const { end } = localDayToIsoRange('2026-07-09')
    const meiaNoiteSeguinte = isoLocal(2026, 7, 10, 0, 0)
    expect(meiaNoiteSeguinte >= end).toBe(true)
  })

  it('00:00 local do próprio dia pertence ao dia', () => {
    const { start, end } = localDayToIsoRange('2026-07-09')
    const meiaNoite = isoLocal(2026, 7, 9, 0, 0)
    expect(meiaNoite >= start && meiaNoite < end).toBe(true)
  })

  it('virada de mês: 31/01 23:30 local está em 31/01, não em 01/02', () => {
    const jan31 = localDayToIsoRange('2026-01-31')
    const fev01 = localDayToIsoRange('2026-02-01')
    const saida = isoLocal(2026, 1, 31, 23, 30)
    expect(saida >= jan31.start && saida < jan31.end).toBe(true)
    expect(saida >= fev01.start).toBe(false)
  })

  it('dias consecutivos são contíguos (end de um = start do outro)', () => {
    expect(localDayToIsoRange('2026-07-09').end).toBe(localDayToIsoRange('2026-07-10').start)
  })
})

describe('localMonthToIsoRange', () => {
  it('pagamento às 23h do último dia do mês pertence ao mês local', () => {
    const { start, end } = localMonthToIsoRange('2026-07')
    const pagamento = isoLocal(2026, 7, 31, 23, 0)
    expect(pagamento >= start && pagamento < end).toBe(true)
  })

  it('primeiro instante do mês seguinte fica fora', () => {
    const { end } = localMonthToIsoRange('2026-07')
    const proximoMes = isoLocal(2026, 8, 1, 0, 0)
    expect(proximoMes >= end).toBe(true)
  })

  it('fevereiro bissexto: 29/02 pertence ao mês', () => {
    const { start, end } = localMonthToIsoRange('2028-02')
    const dia29 = isoLocal(2028, 2, 29, 12, 0)
    expect(dia29 >= start && dia29 < end).toBe(true)
  })

  it('dezembro → janeiro: meses consecutivos são contíguos', () => {
    expect(localMonthToIsoRange('2026-12').end).toBe(localMonthToIsoRange('2027-01').start)
  })
})
