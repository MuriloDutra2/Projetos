/**
 * Turnos de 12h do fechamento de caixa (pedido da operação, vídeo 09/07/2026):
 * DIURNO 07:00–19:00 e NOTURNO 19:00–07:00 do dia seguinte, em horário local.
 * O turno noturno cruza a meia-noite como uma unidade só — resolve o relatório
 * diário que misturava a noite anterior e não batia com a maquininha.
 */
import { localDateStr } from './clientStatus'

export type ShiftType = 'DIURNO' | 'NOTURNO'

export interface ShiftInfo {
  /** Dia local (YYYY-MM-DD) do INÍCIO natural do turno — identifica o turno junto com o tipo. */
  shiftDate: string
  shiftType: ShiftType
  /** Início natural do turno (ISO UTC). */
  startIso: string
  /** Fim natural do turno, exclusivo (ISO UTC). */
  endIso: string
}

/** Turno natural que contém o instante `now`. */
export function currentShift(now: Date, dayStartHour = 7, nightStartHour = 19): ShiftInfo {
  const h = now.getHours()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  if (h >= dayStartHour && h < nightStartHour) {
    const start = new Date(y, m, d, dayStartHour)
    const end = new Date(y, m, d, nightStartHour)
    return {
      shiftDate: localDateStr(start),
      shiftType: 'DIURNO',
      startIso: start.toISOString(),
      endIso: end.toISOString()
    }
  }

  // NOTURNO: começou hoje às nightStartHour (se já passou) ou ontem (se ainda é madrugada).
  const startDay = h >= nightStartHour ? d : d - 1
  const start = new Date(y, m, startDay, nightStartHour)
  const end = new Date(y, m, startDay + 1, dayStartHour)
  return {
    shiftDate: localDateStr(start),
    shiftType: 'NOTURNO',
    startIso: start.toISOString(),
    endIso: end.toISOString()
  }
}

/**
 * Próxima virada de turno estritamente DEPOIS do instante dado (07:00 ou
 * 19:00 locais). Usada pelo fechamento automático (Fase 10).
 */
export function nextShiftBoundaryAfter(d: Date, dayStartHour = 7, nightStartHour = 19): Date {
  const y = d.getFullYear()
  const m = d.getMonth()
  const day = d.getDate()
  const candidates = [
    new Date(y, m, day, dayStartHour),
    new Date(y, m, day, nightStartHour),
    new Date(y, m, day + 1, dayStartHour)
  ]
  for (const c of candidates) {
    if (c.getTime() > d.getTime()) return c
  }
  return new Date(y, m, day + 1, nightStartHour)
}

export function shiftLabel(shiftType: ShiftType, dayStartHour = 7, nightStartHour = 19): string {
  const hh = (n: number): string => `${String(n).padStart(2, '0')}:00`
  return shiftType === 'DIURNO'
    ? `Turno diurno · ${hh(dayStartHour)}–${hh(nightStartHour)}`
    : `Turno noturno · ${hh(nightStartHour)}–${hh(dayStartHour)}`
}
