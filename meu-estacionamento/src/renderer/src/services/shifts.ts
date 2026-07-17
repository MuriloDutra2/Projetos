export interface ShiftByMethod {
  method: string
  avulsos: number
  renovacoes: number
  total: number
}

export interface ShiftPayment {
  id: number
  amount: number
  plan_type: string
  payment_date: string
  payment_method: string | null
  competency_month: string | null
  client_name: string
}

export interface ShiftLiveData {
  totalAvulsos: number
  countAvulsos: number
  totalRenovacoes: number
  countRenovacoes: number
  total: number
  byMethod: ShiftByMethod[]
  cashExpected: number
  tickets: {
    id: number
    placa: string
    tipo: string
    entrada: string
    saida: string
    valor: number | null
    payment_method: string | null
  }[]
  payments: ShiftPayment[]
}

export interface ShiftClosure {
  id: number
  shift_date: string
  shift_type: string
  start_iso: string
  end_iso: string
  total_avulsos: number
  total_renovacoes: number
  count_avulsos: number
  count_renovacoes: number
  by_method_json: string
  cash_expected: number | null
  cash_counted: number | null
  cash_difference: number | null
  operator_name: string | null
  closed_at: string
  auto_closed: number
  confirmed_by: string | null
  confirmed_at: string | null
}

export interface ShiftOverview {
  shift: {
    shiftDate: string
    shiftType: 'DIURNO' | 'NOTURNO'
    startIso: string
    endIso: string
    label: string
  }
  windowStartIso: string
  live: ShiftLiveData | null
  /** Fechamentos automáticos aguardando confirmação (a lista em si é restrita ao gerente). */
  pendingCount: number
}

export async function getShiftOverview(): Promise<ShiftOverview | null> {
  return window.api.getShiftOverview()
}

export async function closeShift(data: {
  cashCounted?: number | null
  operatorName?: string
}): Promise<{ success: boolean; closure?: ShiftClosure; error?: string }> {
  return window.api.closeShift(data)
}

/** Lista de fechamentos — área restrita do gerente (senha validada no processo main). */
export async function getShiftClosures(data: {
  password: string
}): Promise<{ success: boolean; error?: string; closures?: ShiftClosure[] }> {
  return window.api.getShiftClosures(data)
}

/** Confirma um fechamento automático pendente (linha vermelha do histórico; exige a senha do gerente). */
export async function confirmShiftClosure(data: {
  id: number
  operatorName: string
  cashCounted?: number | null
  password: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.confirmShiftClosure(data)
}

export async function printShiftClosure(data: {
  shiftLabel: string
  periodLabel: string
  totalAvulsos: number
  countAvulsos: number
  totalRenovacoes: number
  countRenovacoes: number
  byMethod: { method: string; total: number }[]
  cashExpected: number | null
  cashCounted: number | null
  cashDifference: number | null
  operatorName: string | null
  closedAtLabel: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.printShiftClosure(data)
}
