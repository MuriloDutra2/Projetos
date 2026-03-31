import { describe, it, expect } from 'vitest'
import { calcularValor, isPernoite, minutosDaEstadia } from '../../src/main/calculations'

/** Cria data ISO no mesmo dia (horário local). */
function hoje(hour: number, minute: number): string {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

/** Cria data ISO em um dia específico (YYYY-MM-DD) e hora (horário local). */
function dia(datestr: string, hour: number, minute: number): string {
  const [y, m, d] = datestr.split('-').map(Number)
  const date = new Date(y, m - 1, d, hour, minute, 0, 0)
  return date.toISOString()
}

describe('calcularValor', () => {
  describe('Avulso (90 min grátis)', () => {
    it('1.1 Dentro do grátis (89 min)', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 89)
      expect(calcularValor(entrada, 90, saida.toISOString(), 0, false)).toBe(0)
    })
    it('1.2 Exatamente 90 min', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 90)
      expect(calcularValor(entrada, 90, saida.toISOString(), 0, false)).toBe(0)
    })
    it('1.3 1 minuto além do grátis → R$ 4 (1 fração)', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 91)
      expect(calcularValor(entrada, 90, saida.toISOString(), 0, false)).toBe(4)
    })
    it('1.4 1h31 total avulso → R$ 4', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 91)
      expect(calcularValor(entrada, 90, saida.toISOString(), 0, false)).toBe(4)
    })
    it('1.5 2 horas além do grátis → R$ 8', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 90 + 120)
      expect(calcularValor(entrada, 90, saida.toISOString(), 0, false)).toBe(8)
    })
    it('1.6 1h01 de excedente (fração = 1h) → R$ 8', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 90 + 61)
      expect(calcularValor(entrada, 90, saida.toISOString(), 0, false)).toBe(8)
    })
  })

  describe('Mensalista (150 min grátis)', () => {
    it('1.7 Dentro do grátis (149 min)', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 149)
      expect(calcularValor(entrada, 150, saida.toISOString(), 0, false)).toBe(0)
    })
    it('1.8 Exatamente 2h30 (150 min)', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 150)
      expect(calcularValor(entrada, 150, saida.toISOString(), 0, false)).toBe(0)
    })
    it('1.9 1 min além (2h31) → R$ 4', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 151)
      expect(calcularValor(entrada, 150, saida.toISOString(), 0, false)).toBe(4)
    })
  })

  describe('Uso diário (dailyUsedMinutes)', () => {
    it('1.10 60 min já usados (restam 30 grátis), 60 min estadia → 30 min excedente = R$ 4', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 60)
      expect(calcularValor(entrada, 90, saida.toISOString(), 60, false)).toBe(4)
    })
    it('1.11 90 min já usados, 60 min estadia → 60 min pagos (1h) R$ 4', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 60)
      expect(calcularValor(entrada, 90, saida.toISOString(), 90, false)).toBe(4)
    })
    it('1.18 effectiveFree negativo (dailyUsed > free)', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 60)
      expect(calcularValor(entrada, 90, saida.toISOString(), 100, false)).toBe(4)
    })
  })

  describe('Pernoite', () => {
    it('1.12 Pernoite aplicado (estadia > 24h, entrada 19h, saída 07h) → R$ 50', () => {
      const entrada = dia('2025-01-15', 19, 0)
      const saida = dia('2025-01-17', 7, 0)
      expect(calcularValor(entrada, 90, saida, 0, true)).toBe(50)
    })
    it('1.13 Pernoite não aplicado → valor por horas (12h estadia, 90 min grátis = 11h cobradas R$ 44)', () => {
      const entrada = dia('2025-01-15', 19, 0)
      const saida = dia('2025-01-16', 7, 0)
      const v = calcularValor(entrada, 90, saida, 0, false)
      expect(v).not.toBe(50)
      expect(v).toBe(44)
    })
    it('1.14 Mesmo dia (não é pernoite) → 7h excedente R$ 28', () => {
      const entrada = dia('2025-01-15', 10, 0)
      const saida = dia('2025-01-15', 18, 0)
      expect(calcularValor(entrada, 90, saida, 0, true)).toBe(28)
    })
  })

  describe('Planos especiais', () => {
    it('1.15 Funcionário (720 min) 10h estadia → R$ 0', () => {
      const entrada = hoje(8, 0)
      const saida = new Date(entrada)
      saida.setHours(saida.getHours() + 10)
      expect(calcularValor(entrada, 720, saida.toISOString(), 0, false)).toBe(0)
    })
    it('1.16 Garagem (999999 min)', () => {
      const entrada = hoje(8, 0)
      const saida = new Date(entrada)
      saida.setHours(saida.getHours() + 12)
      expect(calcularValor(entrada, 999999, saida.toISOString(), 0, false)).toBe(0)
    })
    it('1.17 Zero minutos grátis, 1h estadia → R$ 4', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setHours(saida.getHours() + 1)
      expect(calcularValor(entrada, 0, saida.toISOString(), 0, false)).toBe(4)
    })
  })
})

describe('isPernoite', () => {
  it('2.1 Entrada 18h, saída 07h com estadia > 24h → true', () => {
    expect(isPernoite(dia('2025-01-15', 18, 0), dia('2025-01-17', 7, 0))).toBe(true)
  })
  it('2.2 Entrada 19h, saída 08h com estadia > 24h → true', () => {
    expect(isPernoite(dia('2025-01-15', 19, 0), dia('2025-01-17', 8, 0))).toBe(true)
  })
  it('2.4 Saída 09h (fora 00h–08h) → false', () => {
    expect(isPernoite(dia('2025-01-15', 19, 0), dia('2025-01-16', 9, 0))).toBe(false)
  })
  it('2.5 Entrada 17h (antes de 18h) → false', () => {
    expect(isPernoite(dia('2025-01-15', 17, 0), dia('2025-01-16', 2, 0))).toBe(false)
  })
  it('2.6 Mesmo dia → false', () => {
    expect(isPernoite(dia('2025-01-15', 10, 0), dia('2025-01-15', 20, 0))).toBe(false)
  })
})

describe('minutosDaEstadia', () => {
  it('3.1 60 min', () => {
    const e = hoje(10, 0)
    const s = new Date(e)
    s.setMinutes(s.getMinutes() + 60)
    expect(minutosDaEstadia(e, s.toISOString())).toBe(60)
  })
  it('3.2 91 min', () => {
    const e = hoje(10, 0)
    const s = new Date(e)
    s.setMinutes(s.getMinutes() + 91)
    expect(minutosDaEstadia(e, s.toISOString())).toBe(91)
  })
  it('3.3 0 min', () => {
    const e = hoje(10, 0)
    expect(minutosDaEstadia(e, e)).toBe(0)
  })
})
