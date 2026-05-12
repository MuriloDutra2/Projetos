import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { effectiveBillingDayInMonth } from './garageDates'

const dbPath =
  process.env.NODE_ENV === 'development'
    ? join(process.cwd(), 'parking.db')
    : join(app.getPath('userData'), 'parking.db')

const db = new Database(dbPath)

function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    placa TEXT NOT NULL,
    tipo TEXT NOT NULL,
    entrada TEXT NOT NULL,
    saida TEXT,
    valor REAL,
    status TEXT DEFAULT 'ATIVO'
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cpf TEXT,
    phone TEXT,
    plan_type TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS client_vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    plate TEXT NOT NULL UNIQUE,
    FOREIGN KEY (client_id) REFERENCES clients(id)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_free_usage (
    placa TEXT NOT NULL,
    data TEXT NOT NULL,
    minutos_usados INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (placa, data)
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS subscription_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    plan_type TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    new_expiry_date TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id)
  )
`)

ensureColumn('subscription_payments', 'payment_method', "payment_method TEXT NOT NULL DEFAULT 'Não informado'")
ensureColumn('subscription_payments', 'competency_month', 'competency_month TEXT')
ensureColumn('subscription_payments', 'is_advance', 'is_advance INTEGER NOT NULL DEFAULT 0')
ensureColumn('subscription_payments', 'notes', 'notes TEXT')

ensureColumn('clients', 'garage_billing_day', 'garage_billing_day INTEGER')
ensureColumn('clients', 'garage_billing_month', 'garage_billing_month INTEGER')
ensureColumn('subscription_payments', 'payer_display_name', 'payer_display_name TEXT')

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_reports (
    report_date TEXT PRIMARY KEY,
    total_avulsos REAL NOT NULL DEFAULT 0,
    planos_vendidos_count INTEGER NOT NULL DEFAULT 0,
    planos_vendidos_value REAL NOT NULL DEFAULT 0,
    qty_cars INTEGER NOT NULL DEFAULT 0,
    qty_motos INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS family_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS family_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    cpf TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES family_groups(id)
  )
`)

ensureColumn('tickets', 'cpf', 'cpf TEXT')

const stmts = {
  getAllActive: db.prepare(
    "SELECT * FROM tickets WHERE status = 'ATIVO' ORDER BY entrada DESC"
  ),
  getHistory: db.prepare(
    "SELECT id, placa, tipo, entrada, saida, valor FROM tickets WHERE status = 'FINALIZADO' ORDER BY saida DESC LIMIT 50"
  ),
  /** Todos os veículos finalizados no dia (saída entre 00:00 e 23:59 do dia). dateStr = YYYY-MM-DD */
  getHistoryForDay: db.prepare(`
    SELECT id, placa, tipo, entrada, saida, valor
    FROM tickets
    WHERE status = 'FINALIZADO' AND date(saida) = date(?)
    ORDER BY saida DESC
  `),
  /** Veículos com saída nas últimas 24 horas (saida >= sinceIso). */
  getHistoryLast24h: db.prepare(`
    SELECT id, placa, tipo, entrada, saida, valor
    FROM tickets
    WHERE status = 'FINALIZADO' AND saida >= ?
    ORDER BY saida DESC
  `),
  getAllFinishedForFinance: db.prepare(
    "SELECT id, placa, tipo, entrada, saida, valor, 'ticket' as source FROM tickets WHERE status = 'FINALIZADO' ORDER BY saida DESC LIMIT 200"
  ),
  getActiveByPlaca: db.prepare(
    "SELECT id FROM tickets WHERE placa = ? AND status = 'ATIVO' LIMIT 1"
  ),
  createTicket: db.prepare(
    'INSERT INTO tickets (placa, tipo, entrada) VALUES (?, ?, ?)'
  ),
  checkoutTicket: db.prepare(
    'UPDATE tickets SET status = ?, saida = ?, valor = ? WHERE id = ?'
  ),
  excludeTicket: db.prepare(
    "UPDATE tickets SET status = 'EXCLUIDO', saida = ?, valor = 0 WHERE id = ?"
  ),
  excludeAllActiveTickets: db.prepare(
    "UPDATE tickets SET status = 'EXCLUIDO', saida = ?, valor = 0 WHERE status = 'ATIVO'"
  ),
  getExcludedTickets: db.prepare(
    "SELECT id, placa, tipo, entrada, saida FROM tickets WHERE status = 'EXCLUIDO' ORDER BY saida DESC"
  ),
  /** Verifica se a placa teve algum ticket hoje (entrada ou saída no dia) */
  getPlateWasInToday: db.prepare(`
    SELECT 1 FROM tickets
    WHERE UPPER(REPLACE(placa, '-', '')) = UPPER(REPLACE(?, '-', ''))
      AND (date(entrada) = date(?) OR (saida IS NOT NULL AND date(saida) = date(?)))
    LIMIT 1
  `),

  createClient: db.prepare(
    'INSERT INTO clients (name, cpf, phone, plan_type, expiry_date, active, created_at, garage_billing_day, garage_billing_month) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)'
  ),
  insertClientVehicle: db.prepare(
    'INSERT INTO client_vehicles (client_id, plate) VALUES (?, ?)'
  ),
  getClientsWithVehicles: db.prepare(`
    SELECT c.*, 
      (SELECT GROUP_CONCAT(plate) FROM client_vehicles WHERE client_id = c.id) as plates
    FROM clients c
    ORDER BY c.name
  `),
  getLatestPaymentByClientId: db.prepare(`
    SELECT payment_date, amount, competency_month, payment_method, is_advance
    FROM subscription_payments
    WHERE client_id = ?
    ORDER BY payment_date DESC
    LIMIT 1
  `),
  getMaxCompetencyByClientId: db.prepare(`
    SELECT MAX(competency_month) as max_competency
    FROM subscription_payments
    WHERE client_id = ? AND competency_month IS NOT NULL
  `),
  getVehicleByPlate: db.prepare(
    'SELECT cv.*, c.name, c.plan_type, c.expiry_date, c.active, c.garage_billing_day, c.garage_billing_month FROM client_vehicles cv JOIN clients c ON c.id = cv.client_id WHERE cv.plate = ?'
  ),
  updateClientExpiry: db.prepare(
    'UPDATE clients SET expiry_date = ?, active = 1 WHERE id = ?'
  ),
  updateClientActive: db.prepare(
    'UPDATE clients SET active = ? WHERE id = ?'
  ),
  updateClient: db.prepare(
    'UPDATE clients SET name = ?, cpf = ?, phone = ?, plan_type = ?, expiry_date = ?, garage_billing_day = ?, garage_billing_month = ? WHERE id = ?'
  ),
  deleteClientVehicles: db.prepare('DELETE FROM client_vehicles WHERE client_id = ?'),
  deleteClientById: db.prepare('DELETE FROM clients WHERE id = ?'),
  updateSubscriptionPaymentsPayerDisplayName: db.prepare(
    'UPDATE subscription_payments SET payer_display_name = ? WHERE client_id = ?'
  ),
  insertSubscriptionPayment: db.prepare(
    'INSERT INTO subscription_payments (client_id, amount, plan_type, payment_date, new_expiry_date, payment_method, competency_month, is_advance, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ),
  getFinancialHistory: db.prepare(`
    SELECT sp.*, COALESCE(c.name, sp.payer_display_name, 'Cliente removido') as client_name
    FROM subscription_payments sp
    LEFT JOIN clients c ON c.id = sp.client_id
    ORDER BY sp.payment_date DESC
    LIMIT 200
  `),
  getFinancialHistoryByMethod: db.prepare(`
    SELECT COALESCE(payment_method, 'Não informado') as payment_method, COALESCE(SUM(amount), 0) as total
    FROM subscription_payments
    WHERE date(payment_date) >= date(?) AND date(payment_date) <= date(?)
    GROUP BY COALESCE(payment_method, 'Não informado')
    ORDER BY total DESC
  `),
  hasPaymentInMonth: db.prepare(`
    SELECT 1
    FROM subscription_payments
    WHERE client_id = ?
      AND (
        competency_month = ?
        OR (competency_month IS NULL AND strftime('%Y-%m', payment_date) = ?)
      )
    LIMIT 1
  `),
  getClientVehiclesByClientId: db.prepare(`
    SELECT plate
    FROM client_vehicles
    WHERE client_id = ?
  `),
  getClientById: db.prepare(`
    SELECT id, name, cpf, phone, plan_type, expiry_date, active, garage_billing_day, garage_billing_month
    FROM clients
    WHERE id = ?
    LIMIT 1
  `),
  getPaymentsByClientId: db.prepare(`
    SELECT id, amount, plan_type, payment_date, new_expiry_date, payment_method, competency_month, is_advance, notes
    FROM subscription_payments
    WHERE client_id = ?
    ORDER BY payment_date DESC
  `),
  getFinishedTicketsByPlates: db.prepare(`
    SELECT id, placa, tipo, entrada, saida, valor
    FROM tickets
    WHERE status = 'FINALIZADO' AND placa IN (SELECT plate FROM client_vehicles WHERE client_id = ?)
    ORDER BY saida DESC
    LIMIT 500
  `),
  updateActiveTicketTypeByPlate: db.prepare(`
    UPDATE tickets
    SET tipo = ?
    WHERE status = 'ATIVO' AND placa = ?
  `),
  /** Total avulsos (valor) no dia. dateStr = YYYY-MM-DD */
  getTotalAvulsosForDay: db.prepare(
    "SELECT COALESCE(SUM(valor), 0) as total FROM tickets WHERE status = 'FINALIZADO' AND date(saida) = date(?)"
  ),
  /** Contagem e valor de planos vendidos (renovações) no dia */
  getPlanosVendidosForDay: db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
    FROM subscription_payments WHERE date(payment_date) = date(?)
  `),
  getSavedDailyReport: db.prepare(
    'SELECT * FROM daily_reports WHERE report_date = date(?) LIMIT 1'
  ),
  upsertDailyReport: db.prepare(`
    INSERT INTO daily_reports (report_date, total_avulsos, planos_vendidos_count, planos_vendidos_value, qty_cars, qty_motos, created_at)
    VALUES (date(?), ?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_date) DO UPDATE SET
      total_avulsos = excluded.total_avulsos,
      planos_vendidos_count = excluded.planos_vendidos_count,
      planos_vendidos_value = excluded.planos_vendidos_value,
      qty_cars = excluded.qty_cars,
      qty_motos = excluded.qty_motos,
      created_at = excluded.created_at
  `),
  getDailyUsedMinutes: db.prepare(
    'SELECT COALESCE(SUM(minutos_usados), 0) as total FROM daily_free_usage WHERE placa = ? AND data = ?'
  ),
  upsertDailyUsage: db.prepare(`
    INSERT INTO daily_free_usage (placa, data, minutos_usados) VALUES (?, ?, ?)
    ON CONFLICT(placa, data) DO UPDATE SET minutos_usados = minutos_usados + excluded.minutos_usados
  `),

  getFamilyGroupByPlate: db.prepare(`
    SELECT g.id, g.plate, g.created_at,
      json_group_array(
        CASE WHEN m.id IS NOT NULL
          THEN json_object('id', m.id, 'name', m.name, 'cpf', m.cpf)
          ELSE NULL
        END
      ) as members_json
    FROM family_groups g
    LEFT JOIN family_members m ON m.group_id = g.id
    WHERE g.plate = ?
    GROUP BY g.id
  `),
  listFamilyGroups: db.prepare(`
    SELECT g.id, g.plate, g.created_at,
      json_group_array(
        CASE WHEN m.id IS NOT NULL
          THEN json_object('id', m.id, 'name', m.name, 'cpf', m.cpf)
          ELSE NULL
        END
      ) as members_json
    FROM family_groups g
    LEFT JOIN family_members m ON m.group_id = g.id
    GROUP BY g.id
    ORDER BY g.plate
  `),
  insertFamilyGroup: db.prepare(
    'INSERT INTO family_groups (plate, created_at) VALUES (?, ?)'
  ),
  deleteFamilyGroup: db.prepare('DELETE FROM family_groups WHERE id = ?'),
  deleteFamilyMembersByGroup: db.prepare('DELETE FROM family_members WHERE group_id = ?'),
  insertFamilyMember: db.prepare(
    'INSERT INTO family_members (group_id, name, cpf, created_at) VALUES (?, ?, ?, ?)'
  ),
  updateFamilyMember: db.prepare(
    'UPDATE family_members SET name = ?, cpf = ? WHERE id = ?'
  ),
  deleteFamilyMember: db.prepare('DELETE FROM family_members WHERE id = ?')
}

export { effectiveBillingDayInMonth } from './garageDates'

function competencyKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function isGaragemDebtorInternal(
  clientId: number,
  billingDay: number | null | undefined,
  nowDate?: Date
): boolean {
  if (billingDay == null || billingDay < 1 || billingDay > 31) return false
  const now = nowDate ?? new Date()
  const due = effectiveBillingDayInMonth(now.getFullYear(), now.getMonth(), billingDay)
  if (now.getDate() <= due) return false
  const monthKey = competencyKeyFromDate(now)
  const payment = stmts.hasPaymentInMonth.get(clientId, monthKey, monthKey)
  return !payment
}

/** Tipo de ticket ativo conforme o plano do cliente. */
export function ticketTipoForPlan(planType: string): string {
  if (planType === 'GARAGEM') return 'GARAGEM'
  return 'MENSALISTA'
}

/** Traduz erros do SQLite para mensagens em português para o usuário */
export function translateDbError(error: unknown): string {
  const err = error as { code?: string; message?: string }
  if (err?.code === 'SQLITE_CONSTRAINT' || err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return 'Esta placa já está cadastrada no sistema.'
  }
  if (err?.message?.includes('UNIQUE constraint failed')) {
    return 'Esta placa já está cadastrada no sistema.'
  }
  return err?.message ?? 'Erro desconhecido ao salvar.'
}

export const dbOperations = {
  getAllActiveTickets: () => stmts.getAllActive.all(),
  getHistory: () => stmts.getHistory.all(),
  getAllFinishedTicketsForFinance: () => stmts.getAllFinishedForFinance.all(),

  getCurrentCompetencyMonth: (nowDate?: Date) => {
    const now = nowDate ?? new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  },

  addMonthsToCompetency: (competency: string, monthsToAdd: number): string => {
    const [y, m] = competency.split('-').map(Number)
    const d = new Date(y, (m - 1) + monthsToAdd, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  },

  isMensalistaDebtor: (clientId: number, nowDate?: Date) => {
    const now = nowDate ?? new Date()
    const day = now.getDate()
    if (day <= 10) return false
    const monthKey = dbOperations.getCurrentCompetencyMonth(now)
    const payment = stmts.hasPaymentInMonth.get(clientId, monthKey, monthKey)
    return !payment
  },

  hasActiveTicket: (placa: string) => {
    const raw = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const row = stmts.getActiveByPlaca.get(raw) as { id: number } | undefined
    return !!row
  },

  createTicket: (placa: string, tipo: string, entrada: string, cpf?: string) => {
    const result = stmts.createTicket.run(placa, tipo, entrada)
    const id = result.lastInsertRowid as number
    if (cpf) {
      db.prepare('UPDATE tickets SET cpf = ? WHERE id = ?').run(cpf, id)
    }
    return id
  },
  checkoutTicket: (id: number, valor: number, saida: string) => {
    stmts.checkoutTicket.run('FINALIZADO', saida, valor, id)
  },
  excludeTicket: (id: number) => {
    stmts.excludeTicket.run(new Date().toISOString(), id)
  },
  excludeAllActiveTickets: () => {
    stmts.excludeAllActiveTickets.run(new Date().toISOString())
  },
  getExcludedTickets: () => stmts.getExcludedTickets.all() as { id: number; placa: string; tipo: string; entrada: string; saida: string }[],

  getPlateWasInToday: (placa: string, dateStr: string) => {
    const raw = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    if (!raw || raw.length < 7) return false
    const row = stmts.getPlateWasInToday.get(raw, dateStr, dateStr)
    return !!row
  },

  createClient: (data: {
    name: string
    cpf: string
    phone: string
    plan_type: string
    expiry_date: string
    plates: string[]
    garage_billing_day?: number | null
    garage_billing_month?: number | null
  }) => {
    const createdAt = new Date().toISOString()
    const result = stmts.createClient.run(
      data.name,
      data.cpf || '',
      data.phone || '',
      data.plan_type,
      data.expiry_date,
      createdAt,
      data.garage_billing_day ?? null,
      data.garage_billing_month ?? null
    )
    const clientId = result.lastInsertRowid as number
    for (const plate of data.plates) {
      const raw = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase()
      if (raw) {
        stmts.insertClientVehicle.run(clientId, raw)
      }
    }
    return clientId
  },

  getClients: () => {
    const rows = stmts.getClientsWithVehicles.all() as any[]
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const expiryDateOnly = (s: string) => (s || '').slice(0, 10)
    return rows.map((r) => {
      const exp = expiryDateOnly(r.expiry_date)
      const isExpired = exp < todayStr
      const isMensalista = typeof r.plan_type === 'string' && r.plan_type.startsWith('MENSAL')
      const isGaragemPlan = r.plan_type === 'GARAGEM'
      let isDebtor = false
      if (isMensalista) isDebtor = dbOperations.isMensalistaDebtor(r.id, today)
      else if (isGaragemPlan) isDebtor = isGaragemDebtorInternal(r.id, r.garage_billing_day, today)
      const latestPayment = stmts.getLatestPaymentByClientId.get(r.id) as any
      const currentCompetency = dbOperations.getCurrentCompetencyMonth(today)
      const paidCurrentCompetency = !!stmts.hasPaymentInMonth.get(r.id, currentCompetency, currentCompetency)
      let financialStatus = 'Em dia'
      if (isMensalista) {
        if (today.getDate() > 10 && !paidCurrentCompetency) financialStatus = 'Em atraso'
        else if (today.getDate() === 10 && !paidCurrentCompetency) financialStatus = 'Vence hoje'
        else if (today.getDate() < 10 && !paidCurrentCompetency) financialStatus = 'A vencer'
      } else if (isGaragemPlan && r.garage_billing_day != null) {
        const due = effectiveBillingDayInMonth(today.getFullYear(), today.getMonth(), r.garage_billing_day)
        if (today.getDate() > due && !paidCurrentCompetency) financialStatus = 'Em atraso'
        else if (today.getDate() === due && !paidCurrentCompetency) financialStatus = 'Vence hoje'
        else if (today.getDate() < due && !paidCurrentCompetency) financialStatus = 'A vencer'
      }
      const garageBillingLabel =
        isGaragemPlan && r.garage_billing_day != null && r.garage_billing_month != null
          ? `${String(r.garage_billing_day).padStart(2, '0')}/${String(r.garage_billing_month).padStart(2, '0')}`
          : isGaragemPlan && r.garage_billing_day != null
            ? `${String(r.garage_billing_day).padStart(2, '0')}/—`
            : null
      return {
        ...r,
        plates: r.plates ? r.plates.split(',') : [],
        isExpired,
        isDebtor,
        lastPaymentDate: latestPayment?.payment_date ?? null,
        lastPaymentCompetency: latestPayment?.competency_month ?? null,
        financialStatus,
        garageBillingLabel,
        status:
          r.active === 0 ? 'Inativo' : r.active === 1 && !isExpired ? 'Ativo' : 'Vencido'
      }
    })
  },

  updateClientActive: (clientId: number, active: number) => {
    stmts.updateClientActive.run(active, clientId)
  },

  updateClient: (data: {
    id: number
    name: string
    cpf: string
    phone: string
    plan_type: string
    expiry_date: string
    plates: string[]
    garage_billing_day?: number | null
    garage_billing_month?: number | null
  }) => {
    const updateTransaction = db.transaction(() => {
      stmts.updateClient.run(
        data.name,
        data.cpf || '',
        data.phone || '',
        data.plan_type,
        data.expiry_date,
        data.garage_billing_day ?? null,
        data.garage_billing_month ?? null,
        data.id
      )
      stmts.deleteClientVehicles.run(data.id)
      for (const plate of data.plates) {
        const raw = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase()
        if (raw) {
          stmts.insertClientVehicle.run(data.id, raw)
        }
      }
    })
    updateTransaction()
  },

  getVehicleSubscription: (plate: string) => {
    const raw = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const row = stmts.getVehicleByPlate.get(raw) as any
    if (!row) return null
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const expiryStr = (row.expiry_date || '').slice(0, 10)
    const isExpired = row.active !== 1 || expiryStr < todayStr
    let freeMinutes = 90
    if (row.plan_type === 'FUNCIONARIO') freeMinutes = 720
    else if (row.plan_type === 'GARAGEM') freeMinutes = 999999
    else if (row.plan_type && row.plan_type.includes('MENSAL')) freeMinutes = 150
    let isDebtor = false
    if (row.plan_type?.startsWith('MENSAL')) {
      isDebtor = dbOperations.isMensalistaDebtor(row.client_id)
    } else if (row.plan_type === 'GARAGEM') {
      isDebtor = isGaragemDebtorInternal(row.client_id, row.garage_billing_day)
    }
    return {
      clientId: row.client_id,
      clientName: row.name,
      planType: row.plan_type,
      expiryDate: row.expiry_date,
      isExpired,
      freeMinutes,
      isDebtor
    }
  },

  getHistoryForDay: (dateStr: string) => stmts.getHistoryForDay.all(dateStr),

  getHistoryLast24h: () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    return stmts.getHistoryLast24h.all(since)
  },

  getDailyReport: (dateStr: string) => {
    const avulsosRow = stmts.getTotalAvulsosForDay.get(dateStr) as { total: number } | undefined
    const planosRow = stmts.getPlanosVendidosForDay.get(dateStr) as { count: number; total: number } | undefined
    const saved = stmts.getSavedDailyReport.get(dateStr) as {
      report_date: string
      total_avulsos: number
      planos_vendidos_count: number
      planos_vendidos_value: number
      qty_cars: number
      qty_motos: number
      created_at: string
    } | undefined
    return {
      totalAvulsos: avulsosRow?.total ?? 0,
      planosVendidosCount: planosRow?.count ?? 0,
      planosVendidosValue: planosRow?.total ?? 0,
      saved: saved
        ? {
            qtyCars: saved.qty_cars,
            qtyMotos: saved.qty_motos,
            createdAt: saved.created_at
          }
        : null
    }
  },

  saveDailyReport: (
    dateStr: string,
    data: { totalAvulsos: number; planosVendidosCount: number; planosVendidosValue: number; qtyCars: number; qtyMotos: number }
  ) => {
    const now = new Date().toISOString()
    stmts.upsertDailyReport.run(
      dateStr,
      data.totalAvulsos,
      data.planosVendidosCount,
      data.planosVendidosValue,
      data.qtyCars,
      data.qtyMotos,
      now
    )
  },

  getDailyUsedMinutes: (placa: string, data: string) => {
    const raw = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const row = stmts.getDailyUsedMinutes.get(raw, data) as { total: number } | undefined
    return row ? row.total : 0
  },

  addDailyUsedMinutes: (placa: string, data: string, minutos: number) => {
    const raw = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    stmts.upsertDailyUsage.run(raw, data, minutos)
  },

  renewSubscription: (clientId: number, planType: string, amount: number) => {
    return dbOperations.renewSubscriptionAdvanced({
      clientId,
      planType,
      amount,
      months: 1,
      paymentMethod: 'Não informado',
      notes: ''
    })
  },

  renewSubscriptionAdvanced: (data: {
    clientId: number
    planType: string
    amount: number
    months: number
    paymentMethod: string
    notes?: string
  }) => {
    const now = new Date()
    const paymentDateStr = now.toISOString()
    const notes = data.notes ?? ''
    const months = Math.max(1, Math.floor(data.months || 1))
    let newExpiryStr = ''

    if (data.planType.startsWith('MENSAL') || data.planType === 'GARAGEM') {
      const maxCompRow = stmts.getMaxCompetencyByClientId.get(data.clientId) as { max_competency?: string } | undefined
      const currentComp = dbOperations.getCurrentCompetencyMonth(now)
      const startComp =
        maxCompRow?.max_competency && maxCompRow.max_competency >= currentComp
          ? dbOperations.addMonthsToCompetency(maxCompRow.max_competency, 1)
          : currentComp

      let lastComp = startComp
      for (let i = 0; i < months; i++) {
        const competency = dbOperations.addMonthsToCompetency(startComp, i)
        lastComp = competency
        stmts.insertSubscriptionPayment.run(
          data.clientId,
          data.amount,
          data.planType,
          paymentDateStr,
          '',
          data.paymentMethod || 'Não informado',
          competency,
          i > 0 ? 1 : 0,
          notes
        )
      }
      const [y, m] = lastComp.split('-').map(Number)
      const exp = new Date(y, m, 10)
      newExpiryStr = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, '0')}-${String(exp.getDate()).padStart(2, '0')}`
    } else {
      const newExpiry = new Date(now)
      newExpiry.setDate(newExpiry.getDate() + 30)
      newExpiryStr = `${newExpiry.getFullYear()}-${String(newExpiry.getMonth() + 1).padStart(2, '0')}-${String(newExpiry.getDate()).padStart(2, '0')}`
      stmts.insertSubscriptionPayment.run(
        data.clientId,
        data.amount,
        data.planType,
        paymentDateStr,
        newExpiryStr,
        data.paymentMethod || 'Não informado',
        null,
        0,
        notes
      )
    }

    stmts.updateClientExpiry.run(newExpiryStr, data.clientId)
    const clientVehicles = stmts.getClientVehiclesByClientId.all(data.clientId) as { plate: string }[]
    const tipoAtivo = ticketTipoForPlan(data.planType)
    for (const v of clientVehicles) {
      const raw = (v.plate ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
      if (raw) stmts.updateActiveTicketTypeByPlate.run(tipoAtivo, raw)
    }
    return newExpiryStr
  },

  getFinancialHistory: () => stmts.getFinancialHistory.all(),

  /** Bloqueia exclusão se alguma placa do cliente tiver ticket ATIVO no pátio. */
  clientHasActiveParkingTicket: (clientId: number): { blocked: boolean; plate?: string } => {
    const plates = stmts.getClientVehiclesByClientId.all(clientId) as { plate: string }[]
    for (const { plate } of plates) {
      const raw = (plate ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
      if (!raw) continue
      const row = stmts.getActiveByPlaca.get(raw) as { id: number } | undefined
      if (row) return { blocked: true, plate: raw }
    }
    return { blocked: false }
  },

  /**
   * Remove cadastro do cliente e veículos. Pagamentos e tickets finalizados permanecem para auditoria;
   * `payer_display_name` guarda o nome para exibir no financeiro após remover o cliente.
   */
  deleteClientRecord: (clientId: number) => {
    const cli = stmts.getClientById.get(clientId) as { name?: string } | undefined
    if (!cli) throw new Error('Cliente não encontrado')
    const name = cli.name ?? 'Cliente'
    db.pragma('foreign_keys = OFF')
    try {
      stmts.updateSubscriptionPaymentsPayerDisplayName.run(name, clientId)
      stmts.deleteClientVehicles.run(clientId)
      stmts.deleteClientById.run(clientId)
    } finally {
      db.pragma('foreign_keys = ON')
    }
  },

  getFinancialSummaryByMethod: (month: number, year: number) => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0)
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    return stmts.getFinancialHistoryByMethod.all(start, end)
  },

  getClientStatement: (clientId: number) => {
    const client = stmts.getClientById.get(clientId) as any
    if (!client) return null
    const payments = stmts.getPaymentsByClientId.all(clientId) as any[]
    const tickets = stmts.getFinishedTicketsByPlates.all(clientId) as any[]
    const avulsoWhileDebtor = tickets.filter((t) => t.tipo === 'Carro' || t.tipo === 'Moto')
    return {
      client,
      payments,
      avulsoWhileDebtor,
      totals: {
        payments: payments.reduce((s, p) => s + (p.amount ?? 0), 0),
        avulsos: avulsoWhileDebtor.reduce((s, t) => s + (t.valor ?? 0), 0)
      }
    }
  },

  getFamilyGroup: (plate: string) => {
    const raw = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const row = stmts.getFamilyGroupByPlate.get(raw) as any
    if (!row) return null
    const members = JSON.parse(row.members_json || '[]').filter(Boolean)
    return { id: row.id, plate: row.plate, created_at: row.created_at, members }
  },

  listFamilyGroups: () => {
    const rows = stmts.listFamilyGroups.all() as any[]
    return rows.map((r) => ({
      id: r.id,
      plate: r.plate,
      created_at: r.created_at,
      members: JSON.parse(r.members_json || '[]').filter(Boolean)
    }))
  },

  createFamilyGroup: (plate: string) => {
    const raw = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const result = stmts.insertFamilyGroup.run(raw, new Date().toISOString())
    return { id: result.lastInsertRowid as number }
  },

  addFamilyMember: (groupId: number, name: string, cpf: string) => {
    const result = stmts.insertFamilyMember.run(groupId, name, cpf, new Date().toISOString())
    return { id: result.lastInsertRowid as number }
  },

  updateFamilyMember: (memberId: number, name: string, cpf: string) => {
    stmts.updateFamilyMember.run(name, cpf, memberId)
  },

  deleteFamilyMember: (memberId: number) => {
    stmts.deleteFamilyMember.run(memberId)
  },

  deleteFamilyGroup: (groupId: number) => {
    stmts.deleteFamilyMembersByGroup.run(groupId)
    stmts.deleteFamilyGroup.run(groupId)
  }
}

export default db
