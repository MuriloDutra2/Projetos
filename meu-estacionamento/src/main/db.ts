import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

const dbPath =
  process.env.NODE_ENV === 'development'
    ? join(process.cwd(), 'parking.db')
    : join(app.getAppPath(), 'parking.db')

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

const stmts = {
  getAllActive: db.prepare(
    "SELECT * FROM tickets WHERE status = 'ATIVO' ORDER BY entrada DESC"
  ),
  getHistory: db.prepare(
    "SELECT id, placa, tipo, entrada, saida, valor FROM tickets WHERE status = 'FINALIZADO' ORDER BY saida DESC LIMIT 50"
  ),
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
