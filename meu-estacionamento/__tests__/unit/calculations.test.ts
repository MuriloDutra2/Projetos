import { describe, it, expect } from 'vitest'
import {
  calcularValor,
  isPernoite,
  minutosDaEstadia,
  splitStayIntoLocalDaySegments,
  localDateKeyFromDate
} from '../../src/main/calculations'
import type { GetDailyUsedForDate } from '../../src/main/calculations'

/** Uso diário constante (mesmo dia civil nos testes de estacionamento curto). */
function u(n: number): GetDailyUsedForDate {
  return (_dateKey: string) => n
}

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
      expect(calcularValor(entrada, 90, saida.toISOString(), u(0), false)).toBe(0)
    })
    it('1.2 Exatamente 90 min', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 90)
      expect(calcularValor(entrada, 90, saida.toISOString(), u(0), false)).toBe(0)
    })
    it('1.3 1 minuto além do grátis → R$ 4 (1 fração)', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 91)
      expect(calcularValor(entrada, 90, saida.toISOString(), u(0), false)).toBe(4)
    })
    it('1.4 1h31 total avulso → R$ 4', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 91)
      expect(calcularValor(entrada, 90, saida.toISOString(), u(0), false)).toBe(4)
    })
    it('1.5 2 horas além do grátis → R$ 8', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 90 + 120)
      expect(calcularValor(entrada, 90, saida.toISOString(), u(0), false)).toBe(8)
    })
    it('1.6 1h01 de excedente (fração = 1h) → R$ 8', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 90 + 61)
      expect(calcularValor(entrada, 90, saida.toISOString(), u(0), false)).toBe(8)
    })
  })

  describe('Mensalista (150 min grátis)', () => {
    it('1.7 Dentro do grátis (149 min)', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 149)
      expect(calcularValor(entrada, 150, saida.toISOString(), u(0), false)).toBe(0)
    })
    it('1.8 Exatamente 2h30 (150 min)', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 150)
      expect(calcularValor(entrada, 150, saida.toISOString(), u(0), false)).toBe(0)
    })
    it('1.9 1 min além (2h31) → R$ 4', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 151)
      expect(calcularValor(entrada, 150, saida.toISOString(), u(0), false)).toBe(4)
    })
  })

  describe('Uso diário (dailyUsedMinutes)', () => {
    it('1.10 60 min já usados (restam 30 grátis), 60 min estadia → 30 min excedente = R$ 4', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 60)
      expect(calcularValor(entrada, 90, saida.toISOString(), u(60), false)).toBe(4)
    })
    it('1.11 90 min já usados, 60 min estadia → 60 min pagos (1h) R$ 4', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 60)
      expect(calcularValor(entrada, 90, saida.toISOString(), u(90), false)).toBe(4)
    })
    it('1.18 effectiveFree negativo (dailyUsed > free)', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 60)
      expect(calcularValor(entrada, 90, saida.toISOString(), u(100), false)).toBe(4)
    })
  })

  describe('Pernoite', () => {
    it('1.12 Pernoite aplicado (estadia > 24h, entrada 19h, saída 07h) → R$ 50', () => {
      const entrada = dia('2025-01-15', 19, 0)
      const saida = dia('2025-01-17', 7, 0)
      expect(calcularValor(entrada, 90, saida, u(0), true)).toBe(50)
    })
    it('1.13 Estadia cruza meia-noite sem pernoite: cota 90 min por dia civil → R$ 36', () => {
      const entrada = dia('2025-01-15', 19, 0)
      const saida = dia('2025-01-16', 7, 0)
      const v = calcularValor(entrada, 90, saida, u(0), false)
      expect(v).not.toBe(50)
      expect(v).toBe(36)
    })
    it('1.14 Mesmo dia (não é pernoite) → 7h excedente R$ 28', () => {
      const entrada = dia('2025-01-15', 10, 0)
      const saida = dia('2025-01-15', 18, 0)
      expect(calcularValor(entrada, 90, saida, u(0), true)).toBe(28)
    })
  })

  describe('Planos especiais', () => {
    it('1.15 Funcionário (720 min) 10h estadia → R$ 0', () => {
      const entrada = hoje(8, 0)
      const saida = new Date(entrada)
      saida.setHours(saida.getHours() + 10)
      expect(calcularValor(entrada, 720, saida.toISOString(), u(0), false)).toBe(0)
    })
    it('1.16 Garagem (999999 min)', () => {
      const entrada = hoje(8, 0)
      const saida = new Date(entrada)
      saida.setHours(saida.getHours() + 12)
      expect(calcularValor(entrada, 999999, saida.toISOString(), u(0), false)).toBe(0)
    })
    it('1.17 Zero minutos grátis, 1h estadia → R$ 4', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setHours(saida.getHours() + 1)
      expect(calcularValor(entrada, 0, saida.toISOString(), u(0), false)).toBe(4)
    })
  })
})

describe('splitStayIntoLocalDaySegments', () => {
  it('divide 19h dia 15 → 07h dia 16 em dois segmentos', () => {
    const entrada = dia('2025-01-15', 19, 0)
    const saida = dia('2025-01-16', 7, 0)
    const segs = splitStayIntoLocalDaySegments(entrada, saida)
    expect(segs.length).toBe(2)
    expect(segs[0].minutes).toBe(300)
    expect(segs[1].minutes).toBe(420)
  })

  it('estadia de 3 dias civis gera 3 segmentos (meia-noites locais)', () => {
    const entrada = dia('2025-06-01', 10, 0)
    const saida = dia('2025-06-03', 10, 0)
    const segs = splitStayIntoLocalDaySegments(entrada, saida)
    expect(segs.length).toBe(3)
    const total = segs.reduce((a, s) => a + s.minutes, 0)
    expect(total).toBe(48 * 60)
  })

  it('segmentos usam chave YYYY-MM-DD do calendário local', () => {
    const entrada = dia('2025-03-10', 22, 0)
    const saida = dia('2025-03-11', 2, 0)
    const segs = splitStayIntoLocalDaySegments(entrada, saida)
    expect(segs.map((s) => s.dateKey)).toEqual(['2025-03-10', '2025-03-11'])
  })
})

describe('localDateKeyFromDate', () => {
  it('formata dia civil local como YYYY-MM-DD', () => {
    const d = new Date(2025, 6, 5, 14, 30, 0)
    expect(localDateKeyFromDate(d)).toBe('2025-07-05')
  })
})

describe('Cota por dia civil (uso diferente por data)', () => {
  it('cada dia civil aplica seu próprio saldo de minutos já usados', () => {
    const entrada = dia('2025-01-15', 19, 0)
    const saida = dia('2025-01-16', 7, 0)
    const lookup: Record<string, number> = {
      '2025-01-15': 80,
      '2025-01-16': 0
    }
    const getByDay: GetDailyUsedForDate = (key) => lookup[key] ?? 0
    const v = calcularValor(entrada, 90, saida, getByDay, false)
    // Dia 1: 300 min, 10 min grátis efetivos → 290 cobráveis; dia 2: 420 min, 90 grátis → 330 → total 620 → ceil(620/60)=11h → R$44
    expect(v).toBe(44)
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

describe('família — tolerância por CPF', () => {
  it('membro B tem saldo cheio mesmo após membro A esgotar o seu', () => {
    // Membro A usou 150 min (saldo esgotado). Membro B não usou nada.
    // Ao sair com saldo 0 usado (CPF do B), o cálculo de 150 min deve ser grátis.
    expect(calcularValor(dia('2026-01-01', 14, 0), 150, dia('2026-01-01', 16, 30), u(0), false)).toBe(0)
  })

  it('membro C: segunda entrada desconta saldo já usado no dia', () => {
    // Membro C já usou 100 min hoje. Fica mais 60 min (total 160 > 150) → cobra excedente.
    expect(calcularValor(dia('2026-01-01', 14, 0), 150, dia('2026-01-01', 15, 0), u(100), false)).toBeGreaterThan(0)
  })

  it('placa avulsa não-família: comportamento inalterado (90 min grátis)', () => {
    expect(calcularValor(dia('2026-01-01', 10, 0), 90, dia('2026-01-01', 11, 30), u(0), false)).toBe(0)
  })
})
