import { describe, it, expect } from 'vitest'
import { effectiveBillingDayInMonth } from '../../src/main/garageDates'
import { maskDdMm, parseDdMm } from '../../src/renderer/src/utils/masks'

describe('garageDates', () => {
  it('ajusta dia 31 em fevereiro', () => {
    expect(effectiveBillingDayInMonth(2024, 1, 31)).toBe(29)
  })
  it('mantém dia válido', () => {
    expect(effectiveBillingDayInMonth(2024, 1, 15)).toBe(15)
  })
})

describe('parseDdMm / maskDdMm', () => {
  it('parseDdMm aceita 15/03', () => {
    expect(parseDdMm('15/03')).toEqual({ day: 15, month: 3 })
  })
  it('parseDdMm rejeita 31/04', () => {
    expect(parseDdMm('31/04')).toBeNull()
  })
  it('maskDdMm formata', () => {
    expect(maskDdMm('1503')).toBe('15/03')
  })
})
