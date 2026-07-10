import { describe, it, expect } from 'vitest'
import { currentShift, shiftLabel } from '../../src/main/shifts'

describe('currentShift', () => {
  it('07:00 em ponto inicia o turno diurno', () => {
    const s = currentShift(new Date(2026, 6, 9, 7, 0))
    expect(s.shiftType).toBe('DIURNO')
    expect(s.shiftDate).toBe('2026-07-09')
  })

  it('18:59 ainda é diurno', () => {
    const s = currentShift(new Date(2026, 6, 9, 18, 59))
    expect(s.shiftType).toBe('DIURNO')
    expect(s.shiftDate).toBe('2026-07-09')
  })

  it('19:00 em ponto inicia o noturno de hoje', () => {
    const s = currentShift(new Date(2026, 6, 9, 19, 0))
    expect(s.shiftType).toBe('NOTURNO')
    expect(s.shiftDate).toBe('2026-07-09')
  })

  it('madrugada (00:30) pertence ao noturno iniciado ONTEM', () => {
    const s = currentShift(new Date(2026, 6, 9, 0, 30))
    expect(s.shiftType).toBe('NOTURNO')
    expect(s.shiftDate).toBe('2026-07-08')
  })

  it('06:59 ainda é o noturno de ontem', () => {
    const s = currentShift(new Date(2026, 6, 9, 6, 59))
    expect(s.shiftType).toBe('NOTURNO')
    expect(s.shiftDate).toBe('2026-07-08')
  })

  it('noturno cruza a meia-noite como intervalo contínuo (19h → 7h)', () => {
    const s = currentShift(new Date(2026, 6, 9, 23, 0))
    const dur = (new Date(s.endIso).getTime() - new Date(s.startIso).getTime()) / 3600000
    expect(dur).toBe(12)
  })

  it('turnos são contíguos: fim do diurno = início do noturno', () => {
    const diurno = currentShift(new Date(2026, 6, 9, 12, 0))
    const noturno = currentShift(new Date(2026, 6, 9, 20, 0))
    expect(diurno.endIso).toBe(noturno.startIso)
  })

  it('virada de mês: madrugada de 01/08 pertence ao noturno de 31/07', () => {
    const s = currentShift(new Date(2026, 7, 1, 2, 0))
    expect(s.shiftType).toBe('NOTURNO')
    expect(s.shiftDate).toBe('2026-07-31')
  })

  it('respeita horários configuráveis (ex.: 6h/18h)', () => {
    const s = currentShift(new Date(2026, 6, 9, 6, 30), 6, 18)
    expect(s.shiftType).toBe('DIURNO')
  })
})

describe('shiftLabel', () => {
  it('formata os rótulos', () => {
    expect(shiftLabel('DIURNO')).toBe('Turno diurno · 07:00–19:00')
    expect(shiftLabel('NOTURNO')).toBe('Turno noturno · 19:00–07:00')
  })
})
