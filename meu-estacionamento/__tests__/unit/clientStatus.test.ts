import { describe, it, expect } from 'vitest'
import { isCoveredNow, financialStatusFor, localDateStr, localMonthKey } from '../../src/main/clientStatus'

describe('isCoveredNow', () => {
  it('caso do vídeo (09/07/2026): pagou, vencimento 09/08 futuro → coberto mesmo sem competência do mês', () => {
    // Amanhã (10/07) a regra antiga marcaria "Vence hoje" e depois "Em atraso"
    for (const dia of [9, 10, 11, 25]) {
      expect(
        isCoveredNow({
          expiryDate: '2026-08-09',
          maxPaidCompetency: null,
          paidCurrentMonth: false,
          now: new Date(2026, 6, dia)
        })
      ).toBe(true)
    }
  })

  it('vencimento é exatamente hoje → coberto', () => {
    expect(
      isCoveredNow({
        expiryDate: '2026-07-10',
        maxPaidCompetency: null,
        paidCurrentMonth: false,
        now: new Date(2026, 6, 10)
      })
    ).toBe(true)
  })

  it('pagamento adiantado: competência futura paga cobre o mês atual', () => {
    expect(
      isCoveredNow({
        expiryDate: '2026-06-10',
        maxPaidCompetency: '2026-08',
        paidCurrentMonth: false,
        now: new Date(2026, 6, 15)
      })
    ).toBe(true)
  })

  it('pagamento lançado no mês atual (regra antiga) continua valendo', () => {
    expect(
      isCoveredNow({
        expiryDate: null,
        maxPaidCompetency: null,
        paidCurrentMonth: true,
        now: new Date(2026, 6, 15)
      })
    ).toBe(true)
  })

  it('devedor real: vencimento passado, sem competência atual → não coberto', () => {
    expect(
      isCoveredNow({
        expiryDate: '2026-06-10',
        maxPaidCompetency: '2026-06',
        paidCurrentMonth: false,
        now: new Date(2026, 6, 11)
      })
    ).toBe(false)
  })

  it('expiry_date com hora anexada (YYYY-MM-DDTHH...) é comparado só pela data', () => {
    expect(
      isCoveredNow({
        expiryDate: '2026-07-10T00:00:00.000Z',
        maxPaidCompetency: null,
        paidCurrentMonth: false,
        now: new Date(2026, 6, 10)
      })
    ).toBe(true)
  })
})

describe('financialStatusFor', () => {
  const dia = (d: number): Date => new Date(2026, 6, d)

  it('coberto é sempre Em dia, mesmo depois do vencimento', () => {
    expect(financialStatusFor(true, 10, dia(5))).toBe('Em dia')
    expect(financialStatusFor(true, 10, dia(10))).toBe('Em dia')
    expect(financialStatusFor(true, 10, dia(25))).toBe('Em dia')
  })

  it('não coberto segue a régua do dia de vencimento', () => {
    expect(financialStatusFor(false, 10, dia(5))).toBe('A vencer')
    expect(financialStatusFor(false, 10, dia(10))).toBe('Vence hoje')
    expect(financialStatusFor(false, 10, dia(11))).toBe('Em atraso')
  })

  it('garagem: régua respeita o billing day informado', () => {
    expect(financialStatusFor(false, 9, dia(8))).toBe('A vencer')
    expect(financialStatusFor(false, 9, dia(9))).toBe('Vence hoje')
    expect(financialStatusFor(false, 9, dia(10))).toBe('Em atraso')
  })
})

describe('localDateStr / localMonthKey', () => {
  it('formata a data local com zero à esquerda', () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(localMonthKey(new Date(2026, 0, 5))).toBe('2026-01')
  })
})
