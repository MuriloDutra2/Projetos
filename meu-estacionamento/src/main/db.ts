import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

const dbPath =
  process.env.NODE_ENV === 'development'
    ? join(process.cwd(), 'parking.db')
    : join(app.getPath('userData'), 'parking.db')

const db = new Database(dbPath)

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
    'INSERT INTO clients (name, cpf, phone, plan_type, expiry_date, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
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
  getVehicleByPlate: db.prepare(
    'SELECT cv.*, c.name, c.plan_type, c.expiry_date, c.active FROM client_vehicles cv JOIN clients c ON c.id = cv.client_id WHERE cv.plate = ?'
  ),
  updateClientExpiry: db.prepare(
    'UPDATE clients SET expiry_date = ?, active = 1 WHERE id = ?'
  ),
  updateClientActive: db.prepare(
    'UPDATE clients SET active = ? WHERE id = ?'
  ),
  updateClient: db.prepare(
    'UPDATE clients SET name = ?, cpf = ?, phone = ?, plan_type = ?, expiry_date = ? WHERE id = ?'
  ),
  deleteClientVehicles: db.prepare('DELETE FROM client_vehicles WHERE client_id = ?'),
  insertSubscriptionPayment: db.prepare(
    'INSERT INTO subscription_payments (client_id, amount, plan_type, payment_date, new_expiry_date) VALUES (?, ?, ?, ?, ?)'
  ),
  getFinancialHistory: db.prepare(`
    SELECT sp.*, c.name as client_name
    FROM subscription_payments sp
    JOIN clients c ON c.id = sp.client_id
    ORDER BY sp.payment_date DESC
    LIMIT 200
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
  `)
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

  hasActiveTicket: (placa: string) => {
    const raw = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const row = stmts.getActiveByPlaca.get(raw) as { id: number } | undefined
    return !!row
  },

  createTicket: (placa: string, tipo: string, entrada: string) => {
    const result = stmts.createTicket.run(placa, tipo, entrada)
    return result.lastInsertRowid as number
  },
  checkoutTicket: (id: number, valor: number, saida: string) => {
    stmts.checkoutTicket.run('FINALIZADO', saida, valor, id)
  },
  excludeTicket: (id: number) => {
    stmts.excludeTicket.run(new Date().toISOString(), id)
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
  }) => {
    const createdAt = new Date().toISOString()
    const result = stmts.createClient.run(
      data.name,
      data.cpf || '',
      data.phone || '',
      data.plan_type,
      data.expiry_date,
      createdAt
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
    return rows.map((r) => ({
      ...r,
      plates: r.plates ? r.plates.split(',') : [],
      isExpired: new Date(r.expiry_date) < new Date(),
      status:
        r.active === 0
          ? 'Inativo'
          : r.active === 1 && new Date(r.expiry_date) >= new Date()
            ? 'Ativo'
            : 'Vencido'
    }))
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
  }) => {
    const updateTransaction = db.transaction(() => {
      stmts.updateClient.run(
        data.name,
        data.cpf || '',
        data.phone || '',
        data.plan_type,
        data.expiry_date,
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
    const expiry = new Date(row.expiry_date)
    const isExpired = row.active !== 1 || expiry < new Date()
    let freeMinutes = 90
    if (row.plan_type === 'FUNCIONARIO') freeMinutes = 720
    else if (row.plan_type === 'GARAGEM') freeMinutes = 999999
    else if (row.plan_type && row.plan_type.includes('MENSAL')) freeMinutes = 150
    return {
      clientId: row.client_id,
      clientName: row.name,
      planType: row.plan_type,
      expiryDate: row.expiry_date,
      isExpired,
      freeMinutes
    }
  },

  getHistoryForDay: (dateStr: string) => stmts.getHistoryForDay.all(dateStr),

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
    const now = new Date()
    const newExpiry = new Date(now)
    newExpiry.setDate(newExpiry.getDate() + 30)
    const newExpiryStr = newExpiry.toISOString()
    const paymentDateStr = now.toISOString()

    stmts.updateClientExpiry.run(newExpiryStr, clientId)
    stmts.insertSubscriptionPayment.run(
      clientId,
      amount,
      planType,
      paymentDateStr,
      newExpiryStr
    )
    return newExpiryStr
  },

  getFinancialHistory: () => stmts.getFinancialHistory.all()
}

export default db
