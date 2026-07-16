import { describe, it, expect } from 'vitest'
import {
  calcularValor,
  isPernoite,
  minutosDaEstadia,
  minutosGratisConsumidos,
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
    it('1.13 Estadia cruza meia-noite sem pernoite: cota ÚNICA de 90 min → R$ 44', () => {
      // Fase 8 (aprovada pela gerência 09/07/2026): antes a meia-noite renovava a
      // cota (2ª cota de 90 min no dia 16 → R$ 36); agora a estadia contínua tem
      // uma cota só: 720 min − 90 = 630 → 11h → R$ 44.
      const entrada = dia('2025-01-15', 19, 0)
      const saida = dia('2025-01-16', 7, 0)
      const v = calcularValor(entrada, 90, saida, u(0), false)
      expect(v).not.toBe(50)
      expect(v).toBe(44)
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

describe('Cota única por estadia (Fase 8 — meia-noite não renova)', () => {
  it('caso do vídeo: entra 23h, sai 01:30 → 60 min excedentes = R$ 4 (antes era R$ 0)', () => {
    const entrada = dia('2025-01-15', 23, 0)
    const saida = dia('2025-01-16', 1, 30)
    expect(calcularValor(entrada, 90, saida, u(0), false)).toBe(4)
  })

  it('cruza a meia-noite ainda dentro da cota: 23h → 00:20 (80 min) = R$ 0', () => {
    const entrada = dia('2025-01-15', 23, 0)
    const saida = dia('2025-01-16', 0, 20)
    expect(calcularValor(entrada, 90, saida, u(0), false)).toBe(0)
  })

  it('a cota desconta o uso do dia da ENTRADA; o uso do dia seguinte é irrelevante', () => {
    const entrada = dia('2025-01-15', 19, 0)
    const saida = dia('2025-01-16', 7, 0)
    const lookup: Record<string, number> = {
      '2025-01-15': 80,
      '2025-01-16': 500
    }
    const getByDay: GetDailyUsedForDate = (key) => lookup[key] ?? 0
    // Cota única: 90 − 80 (usados no dia da entrada) = 10 min grátis;
    // 720 − 10 = 710 → ceil(710/60) = 12h → R$ 48.
    expect(calcularValor(entrada, 90, saida, getByDay, false)).toBe(48)
  })

  it('anti-fraude preservado: reentrada no dia seguinte com cota já consumida cobra', () => {
    // A estadia da noite anterior registrou uso no dia 16 (via daily_free_usage);
    // uma NOVA entrada no dia 16 encontra a cota do dia consumida.
    const entrada = dia('2025-01-16', 10, 0)
    const saida = dia('2025-01-16', 11, 0)
    const lookup: Record<string, number> = { '2025-01-16': 90 }
    const getByDay: GetDailyUsedForDate = (key) => lookup[key] ?? 0
    expect(calcularValor(entrada, 90, saida, getByDay, false)).toBe(4)
  })

  it('pernoite tem precedência sobre a cota única (R$ 50 fixo)', () => {
    const entrada = dia('2025-01-15', 19, 0)
    const saida = dia('2025-01-17', 7, 0)
    expect(calcularValor(entrada, 90, saida, u(0), true)).toBe(50)
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

describe('Fase 9 — cota fantasma (registro só dos minutos grátis, no dia da entrada)', () => {
  it('helper: dentro da cota registra a estadia inteira', () => {
    expect(minutosGratisConsumidos(dia('2026-07-14', 10, 0), dia('2026-07-14', 11, 0), 90, 0)).toBe(60)
  })

  it('helper: estadia acima da cota registra SÓ a cota (minutos pagos não consomem)', () => {
    // 153 min de estadia, cota 90 → registra 90; os 63 pagos ficam de fora
    expect(minutosGratisConsumidos(dia('2026-07-14', 23, 37), dia('2026-07-15', 2, 10), 90, 0)).toBe(90)
  })

  it('helper: cota já consumida no dia → registra 0', () => {
    expect(minutosGratisConsumidos(dia('2026-07-14', 10, 0), dia('2026-07-14', 11, 0), 90, 90)).toBe(0)
    expect(minutosGratisConsumidos(dia('2026-07-14', 10, 0), dia('2026-07-14', 11, 0), 90, 130)).toBe(0)
  })

  it('helper: estadia zero ou negativa → 0', () => {
    const e = dia('2026-07-14', 10, 0)
    expect(minutosGratisConsumidos(e, e, 90, 0)).toBe(0)
  })

  it('cenário do vídeo (15/07/2026): noite 1 paga o excedente, noite 2 dentro da cota sai grátis', () => {
    // Simula o daily_free_usage entre os checkouts, como o handler faz agora
    const uso: Record<string, number> = {}
    const getUso: GetDailyUsedForDate = (key) => uso[key] ?? 0
    const registra = (entrada: string, saida: string): void => {
      const entryDay = localDateKeyFromDate(new Date(entrada))
      const g = minutosGratisConsumidos(entrada, saida, 90, getUso(entryDay))
      if (g > 0) uso[entryDay] = (uso[entryDay] ?? 0) + g
    }

    // Noite 1: entra 23:37 (dia 14), sai 02:10 (dia 15) = 153 min → 63 excedentes → R$ 8 (pago)
    const e1 = dia('2026-07-14', 23, 37)
    const s1 = dia('2026-07-15', 2, 10)
    expect(calcularValor(e1, 90, s1, getUso, false)).toBe(8)
    registra(e1, s1)
    // Registro vai TODO para o dia 14; o dia 15 fica limpo (antes recebia +130 fantasmas)
    expect(uso['2026-07-14']).toBe(90)
    expect(uso['2026-07-15']).toBeUndefined()

    // Noite 2: entra 23:37 (dia 15), sai 01:02 (dia 16) = 85 min, dentro da cota → R$ 0
    // (na regra antiga de registro, cobrava R$ 8 — o bug do vídeo)
    const e2 = dia('2026-07-15', 23, 37)
    const s2 = dia('2026-07-16', 1, 2)
    expect(calcularValor(e2, 90, s2, getUso, false)).toBe(0)
    registra(e2, s2)
    expect(uso['2026-07-15']).toBe(85)
  })

  it('anti-fraude do mesmo dia preservado: 2ª visita desconta o grátis já usado', () => {
    const uso: Record<string, number> = {}
    const getUso: GetDailyUsedForDate = (key) => uso[key] ?? 0
    // Visita 1: 60 min de manhã → grátis, registra 60
    const e1 = dia('2026-07-14', 10, 0)
    const s1 = dia('2026-07-14', 11, 0)
    expect(calcularValor(e1, 90, s1, getUso, false)).toBe(0)
    uso['2026-07-14'] = minutosGratisConsumidos(e1, s1, 90, 0)
    // Visita 2 no mesmo dia: 50 min, restam só 30 de cota → 20 min cobráveis → R$ 4
    const e2 = dia('2026-07-14', 15, 0)
    const s2 = dia('2026-07-14', 15, 50)
    expect(calcularValor(e2, 90, s2, getUso, false)).toBe(4)
    // E registra só os 30 grátis restantes
    expect(minutosGratisConsumidos(e2, s2, 90, uso['2026-07-14'])).toBe(30)
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
