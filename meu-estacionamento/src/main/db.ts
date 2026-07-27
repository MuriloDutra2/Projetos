import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { effectiveBillingDayInMonth } from './garageDates'
import { localDayToIsoRange, localMonthToIsoRange } from './dateRanges'
import { isCoveredNow, financialStatusFor, localDateStr, localMonthKey } from './clientStatus'
import { currentShift, nextShiftBoundaryAfter } from './shifts'

const dbPath =
  process.env.NODE_ENV === 'development'
    ? join(process.cwd(), 'parking.db')
    : join(app.getPath('userData'), 'parking.db')

const db = new Database(dbPath)

/**
 * Desempenho de escrita (Fase 13a). O padrão do SQLite (journal DELETE +
 * synchronous FULL) faz um fsync por transação — e cada entrada de veículo são
 * três transações. Medido em banco de produção sintético: 12,4 ms por entrada
 * no padrão contra 0,2 ms com WAL (59× mais rápido), e a diferença é ainda
 * maior em HD mecânico, como o do estacionamento.
 *
 * WAL é o modo recomendado para app local de usuário único. synchronous=NORMAL
 * mantém a segurança contra queda do APP (só uma queda de energia poderia
 * perder a última transação) — e há backup a cada inicialização.
 */
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

/**
 * Snapshot do parking.db a cada inicialização — se algo der errado em uma
 * atualização ou migração, sempre há cópias recentes em userData/backups/.
 * Mantém os 10 backups mais recentes (rolling).
 *
 * Usa db.backup() (assíncrono e consistente com WAL) em vez de copyFileSync:
 * copiar o arquivo bruto ignoraria o -wal e poderia gerar cópia inconsistente,
 * além de travar a abertura do app por ~1,5 s em HD com banco grande.
 */
function backupDatabaseOnStartup(): void {
  if (!existsSync(dbPath)) return
  try {
    const backupDir = join(dirname(dbPath), 'backups')
    mkdirSync(backupDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = join(backupDir, `parking-${ts}.db`)
    const rotacionar = (): void => {
      const files = readdirSync(backupDir)
        .filter((f) => f.startsWith('parking-') && f.endsWith('.db'))
        .sort()
        .reverse()
      files.slice(10).forEach((f) => {
        try {
          unlinkSync(join(backupDir, f))
        } catch {
          // ignora erro de delete; próximo startup tenta de novo
        }
      })
    }
    db.backup(backupPath)
      .then(rotacionar)
      .catch((e) => {
        // Rede de segurança: nunca ficar sem backup. Consolida o WAL no arquivo
        // principal e copia o arquivo bruto (consistente logo após o
        // checkpoint, antes de qualquer escrita da janela).
        console.warn('[backup] db.backup falhou, usando cópia direta:', e)
        try {
          db.pragma('wal_checkpoint(TRUNCATE)')
          copyFileSync(dbPath, backupPath)
          rotacionar()
        } catch (e2) {
          console.warn('[backup] Falha também na cópia direta:', e2)
        }
      })
  } catch (e) {
    console.warn('[backup] Falha ao copiar parking.db:', e)
  }
}

backupDatabaseOnStartup()

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
// Fase 12 — pagamento dividido na renovação: a 2ª parte (outra forma de
// pagamento, mesma competência) referencia a linha principal. Nas contagens
// de "planos vendidos", linhas com split_of não contam como venda.
ensureColumn('subscription_payments', 'split_of', 'split_of INTEGER')

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

// Migração: o índice anterior era (group_id, cpf); agora o CPF é único globalmente.
db.exec(`DROP INDEX IF EXISTS idx_family_members_group_cpf`)
try {
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_family_members_cpf
    ON family_members(cpf)
  `)
} catch (e) {
  console.warn(
    '[family_members] CPFs duplicados impedem criação do índice único. ' +
      'Remova duplicatas manualmente pela tela "Grupos Familiares" e reinicie o app.',
    e
  )
}

ensureColumn('tickets', 'cpf', 'cpf TEXT')
// Forma de pagamento do avulso (Dinheiro/Pix/Cartão); NULL em saída gratuita ou registros antigos.
ensureColumn('tickets', 'payment_method', 'payment_method TEXT')

// ── Sync LAN: identificador único deste nó ──────────────────────────────
const nodeIdPath = join(dirname(dbPath), 'node-id.txt')
let NODE_ID: string
if (existsSync(nodeIdPath)) {
  NODE_ID = readFileSync(nodeIdPath, 'utf-8').trim()
} else {
  NODE_ID = randomUUID()
  mkdirSync(dirname(nodeIdPath), { recursive: true })
  writeFileSync(nodeIdPath, NODE_ID, 'utf-8')
}

// ── Sync LAN: tabela de log de mudanças ─────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sync_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
    payload TEXT NOT NULL
  )
`)

db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_log_seq ON sync_log(seq)`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_log_node ON sync_log(node_id, seq)`)

// Índices para as consultas por intervalo (financeiro/turnos/placa-no-dia);
// sem eles, cada consulta varre a tabela inteira, que só cresce.
db.exec(`CREATE INDEX IF NOT EXISTS idx_tickets_status_saida ON tickets(status, saida)`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON subscription_payments(payment_date)`)

// Índice de EXPRESSÃO para "placa esteve hoje" (Fase 13a): a consulta compara
// UPPER(REPLACE(placa,'-','')), o que impedia o uso de índice e varria a tabela
// inteira a cada digitação de placa (29 ms aos 18 meses, piorando sempre).
// Indexar a mesma expressão resolve sem alterar nenhum dado gravado: medido
// 29,2 ms (SCAN) → 0,1 ms (SEARCH USING INDEX).
db.exec(`CREATE INDEX IF NOT EXISTS idx_tickets_placa_norm ON tickets(UPPER(REPLACE(placa, '-', '')))`)

// ── Fechamento de caixa ──────────────────────────────────────────────────
// Cada fechamento é um registro IMUTÁVEL (sem UPDATE/DELETE). Vários caixas
// podem ser fechados dentro do mesmo turno de 12h — o operador pode fechar e
// abrir um caixa novo a qualquer momento, sem esperar a troca de turno.
// start_iso/end_iso guardam o intervalo REAL coberto: cada caixa começa onde
// o anterior terminou (corrente sem buracos) e vai até o instante do
// fechamento. Transação lançada depois entra no caixa seguinte.
db.exec(`
  CREATE TABLE IF NOT EXISTS shift_closures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_date TEXT NOT NULL,
    shift_type TEXT NOT NULL CHECK(shift_type IN ('DIURNO','NOTURNO')),
    start_iso TEXT NOT NULL,
    end_iso TEXT NOT NULL,
    total_avulsos REAL NOT NULL DEFAULT 0,
    total_renovacoes REAL NOT NULL DEFAULT 0,
    count_avulsos INTEGER NOT NULL DEFAULT 0,
    count_renovacoes INTEGER NOT NULL DEFAULT 0,
    by_method_json TEXT NOT NULL DEFAULT '[]',
    cash_expected REAL,
    cash_counted REAL,
    cash_difference REAL,
    operator_name TEXT,
    closed_at TEXT NOT NULL
  )
`)

// Migração: versões anteriores tinham UNIQUE(shift_date, shift_type), que
// limitava a um fechamento por turno. Agora vários caixas por turno são
// permitidos — reconstrói a tabela removendo o auto-índice único, preservando
// as linhas. shift_closures é recente (v1.1.0), então não há dados em produção.
const shiftClosureIndexes = db
  .prepare("PRAGMA index_list('shift_closures')")
  .all() as { name: string; unique: number; origin: string }[]
if (shiftClosureIndexes.some((i) => i.origin === 'u')) {
  const rebuildShiftClosures = db.transaction(() => {
    db.exec(`
      CREATE TABLE shift_closures_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shift_date TEXT NOT NULL,
        shift_type TEXT NOT NULL CHECK(shift_type IN ('DIURNO','NOTURNO')),
        start_iso TEXT NOT NULL,
        end_iso TEXT NOT NULL,
        total_avulsos REAL NOT NULL DEFAULT 0,
        total_renovacoes REAL NOT NULL DEFAULT 0,
        count_avulsos INTEGER NOT NULL DEFAULT 0,
        count_renovacoes INTEGER NOT NULL DEFAULT 0,
        by_method_json TEXT NOT NULL DEFAULT '[]',
        cash_expected REAL,
        cash_counted REAL,
        cash_difference REAL,
        operator_name TEXT,
        closed_at TEXT NOT NULL
      )
    `)
    db.exec(`
      INSERT INTO shift_closures_new
      SELECT id, shift_date, shift_type, start_iso, end_iso, total_avulsos,
             total_renovacoes, count_avulsos, count_renovacoes, by_method_json,
             cash_expected, cash_counted, cash_difference, operator_name, closed_at
      FROM shift_closures
    `)
    db.exec(`DROP TABLE shift_closures`)
    db.exec(`ALTER TABLE shift_closures_new RENAME TO shift_closures`)
  })
  rebuildShiftClosures()
}

// Fase 10 — fechamento automático na troca de turno: marca a origem do
// fechamento e a confirmação posterior do operador (linha vermelha no
// histórico até ser confirmada).
ensureColumn('shift_closures', 'auto_closed', 'auto_closed INTEGER NOT NULL DEFAULT 0')
ensureColumn('shift_closures', 'confirmed_by', 'confirmed_by TEXT')
ensureColumn('shift_closures', 'confirmed_at', 'confirmed_at TEXT')

/** Registra uma operação de escrita no sync_log para replicação LAN. */
function logSync(
  tableName: string,
  rowId: string | number,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: Record<string, unknown>
): void {
  db.prepare(
    'INSERT INTO sync_log (node_id, timestamp, table_name, row_id, operation, payload) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(NODE_ID, new Date().toISOString(), tableName, String(rowId), operation, JSON.stringify(payload))
}

// Exporta para uso em outros módulos (ex: servidor sync)
export { NODE_ID, logSync }

const stmts = {
  getAllActive: db.prepare(
    "SELECT * FROM tickets WHERE status = 'ATIVO' ORDER BY entrada DESC"
  ),
  getHistory: db.prepare(
    "SELECT id, placa, tipo, entrada, saida, valor FROM tickets WHERE status = 'FINALIZADO' ORDER BY saida DESC LIMIT 50"
  ),
  /** Todos os veículos finalizados no dia local (saída em [início, fim) do dia em ISO UTC). */
  getFinishedTicketsForRange: db.prepare(`
    SELECT id, placa, tipo, entrada, saida, valor, payment_method
    FROM tickets
    WHERE status = 'FINALIZADO' AND saida >= ? AND saida < ?
    ORDER BY saida DESC
  `),
  /** Veículos com saída nas últimas 24 horas (saida >= sinceIso). */
  getHistoryLast24h: db.prepare(`
    SELECT id, placa, tipo, entrada, saida, valor
    FROM tickets
    WHERE status = 'FINALIZADO' AND saida >= ?
    ORDER BY saida DESC
  `),
  getActiveByPlaca: db.prepare(
    "SELECT id FROM tickets WHERE placa = ? AND status = 'ATIVO' LIMIT 1"
  ),
  createTicket: db.prepare(
    'INSERT INTO tickets (placa, tipo, entrada) VALUES (?, ?, ?)'
  ),
  checkoutTicket: db.prepare(
    'UPDATE tickets SET status = ?, saida = ?, valor = ?, payment_method = ? WHERE id = ?'
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
  /** Verifica se a placa teve algum ticket no dia local (entrada ou saída em [início, fim) ISO UTC) */
  getPlateWasInToday: db.prepare(`
    SELECT 1 FROM tickets
    WHERE UPPER(REPLACE(placa, '-', '')) = UPPER(REPLACE(?, '-', ''))
      AND ((entrada >= ? AND entrada < ?) OR (saida IS NOT NULL AND saida >= ? AND saida < ?))
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
  /** Maior competência paga por cliente, em lote (evita N+1 no getClients). */
  getMaxCompetencyPerClient: db.prepare(`
    SELECT client_id, MAX(competency_month) as max_competency
    FROM subscription_payments
    WHERE competency_month IS NOT NULL
    GROUP BY client_id
  `),
  /** Clientes com pagamento no mês (competência ou, sem competência, payment_date no intervalo). */
  getClientsPaidInMonth: db.prepare(`
    SELECT DISTINCT client_id
    FROM subscription_payments
    WHERE competency_month = ?
       OR (competency_month IS NULL AND payment_date >= ? AND payment_date < ?)
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
    'INSERT INTO subscription_payments (client_id, amount, plan_type, payment_date, new_expiry_date, payment_method, competency_month, is_advance, notes, split_of) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ),
  getFinancialHistory: db.prepare(`
    SELECT sp.*, COALESCE(c.name, sp.payer_display_name, 'Cliente removido') as client_name
    FROM subscription_payments sp
    LEFT JOIN clients c ON c.id = sp.client_id
    ORDER BY sp.payment_date DESC
    LIMIT 200
  `),
  /** Avulsos pagos por forma de pagamento no intervalo [início, fim) ISO UTC. */
  getAvulsosByMethodForRange: db.prepare(`
    SELECT COALESCE(payment_method, 'Não informado') as payment_method, COALESCE(SUM(valor), 0) as total
    FROM tickets
    WHERE status = 'FINALIZADO' AND valor > 0 AND saida >= ? AND saida < ?
    GROUP BY COALESCE(payment_method, 'Não informado')
  `),
  insertShiftClosure: db.prepare(`
    INSERT INTO shift_closures (
      shift_date, shift_type, start_iso, end_iso,
      total_avulsos, total_renovacoes, count_avulsos, count_renovacoes,
      by_method_json, cash_expected, cash_counted, cash_difference, operator_name, closed_at,
      auto_closed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  /** Única atualização permitida em fechamentos: confirmar um AUTOMÁTICO pendente (totais imutáveis). */
  confirmShiftClosure: db.prepare(`
    UPDATE shift_closures
    SET confirmed_by = ?, confirmed_at = ?,
        cash_counted = COALESCE(cash_counted, ?),
        cash_difference = COALESCE(cash_difference, ?)
    WHERE id = ? AND auto_closed = 1 AND confirmed_at IS NULL
  `),
  getShiftClosureById: db.prepare('SELECT * FROM shift_closures WHERE id = ?'),
  getLastShiftClosure: db.prepare(
    'SELECT * FROM shift_closures ORDER BY end_iso DESC LIMIT 1'
  ),
  listShiftClosures: db.prepare(
    'SELECT * FROM shift_closures ORDER BY end_iso DESC LIMIT ?'
  ),
  countPendingAutoClosures: db.prepare(
    'SELECT COUNT(*) as count FROM shift_closures WHERE auto_closed = 1 AND confirmed_at IS NULL'
  ),
  /** Pagamentos de renovação no intervalo [início, fim) ISO UTC — sem LIMIT (totais e CSV). */
  getPaymentsForRange: db.prepare(`
    SELECT sp.*, COALESCE(c.name, sp.payer_display_name, 'Cliente removido') as client_name
    FROM subscription_payments sp
    LEFT JOIN clients c ON c.id = sp.client_id
    WHERE sp.payment_date >= ? AND sp.payment_date < ?
    ORDER BY sp.payment_date DESC
  `),
  getFinancialHistoryByMethod: db.prepare(`
    SELECT COALESCE(payment_method, 'Não informado') as payment_method, COALESCE(SUM(amount), 0) as total
    FROM subscription_payments
    WHERE payment_date >= ? AND payment_date < ?
    GROUP BY COALESCE(payment_method, 'Não informado')
    ORDER BY total DESC
  `),
  /** Pagamento no mês: competência igual à chave, ou (linhas antigas sem competência) payment_date dentro do mês local [início, fim) ISO UTC. */
  hasPaymentInMonth: db.prepare(`
    SELECT 1
    FROM subscription_payments
    WHERE client_id = ?
      AND (
        competency_month = ?
        OR (competency_month IS NULL AND payment_date >= ? AND payment_date < ?)
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
  /** Contagem e total de avulsos no intervalo [início, fim) ISO UTC. */
  getTotalAvulsosForRange: db.prepare(
    "SELECT COUNT(*) as count, COALESCE(SUM(valor), 0) as total FROM tickets WHERE status = 'FINALIZADO' AND saida >= ? AND saida < ?"
  ),
  /**
   * Contagem e valor de planos vendidos (renovações) no intervalo [início, fim) ISO UTC.
   * Pagamento de N meses gera N linhas (1 por competência) com o valor mensal em cada:
   * o valor soma todas (caixa recebeu o total hoje), mas a contagem só considera a
   * venda (is_advance = 0) para não inflar "planos vendidos".
   */
  getPlanosVendidosForRange: db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(is_advance, 0) = 0 AND split_of IS NULL THEN 1 ELSE 0 END), 0) as count,
      COALESCE(SUM(amount), 0) as total
    FROM subscription_payments WHERE payment_date >= ? AND payment_date < ?
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
  deleteFamilyMember: db.prepare('DELETE FROM family_members WHERE id = ?'),
  getMemberById: db.prepare('SELECT id, group_id, name, cpf FROM family_members WHERE id = ?'),
  hasActiveTicketByCpf: db.prepare(
    "SELECT id FROM tickets WHERE cpf = ? AND status = 'ATIVO' LIMIT 1"
  )
}

const normalizeCpfDigits = (cpf: string) => cpf.replace(/\D/g, '')

export interface ShiftClosureRow {
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

export { effectiveBillingDayInMonth } from './garageDates'

/**
 * Cliente coberto hoje: vencimento futuro, competência máxima paga cobre o mês
 * atual, ou pagamento lançado no mês atual. Se `expiryDate` não for passado,
 * busca o cadastro. Regra pura em clientStatus.ts (caso do vídeo 09/07/2026).
 */
function isClientCoveredNow(clientId: number, expiryDate: string | null | undefined, now: Date): boolean {
  const exp =
    expiryDate !== undefined
      ? expiryDate
      : (stmts.getClientById.get(clientId) as { expiry_date?: string } | undefined)?.expiry_date
  const monthKey = localMonthKey(now)
  const maxCompRow = stmts.getMaxCompetencyByClientId.get(clientId) as { max_competency?: string } | undefined
  const { start, end } = localMonthToIsoRange(monthKey)
  const paidCurrentMonth = !!stmts.hasPaymentInMonth.get(clientId, monthKey, start, end)
  return isCoveredNow({
    expiryDate: exp ?? null,
    maxPaidCompetency: maxCompRow?.max_competency ?? null,
    paidCurrentMonth,
    now
  })
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
  return !isClientCoveredNow(clientId, undefined, now)
}

/**
 * Início da janela ao vivo do turno: onde o último fechamento terminou
 * (corrente sem buracos) ou o início natural do turno. Se o fim do último
 * fechamento estiver "no futuro" (relógio do PC offline acertado para trás
 * depois de um fechamento), recua para o instante atual — sem isso, as
 * transações novas cairiam dentro do intervalo já fechado e sumiriam de
 * todos os fechamentos seguintes.
 */
/** Une as quebras por forma de avulsos e renovações; 'Dinheiro' vira o esperado da gaveta. */
function mergeByMethod(
  avulsos: { payment_method: string; total: number }[],
  renovacoes: { payment_method: string; total: number }[]
): {
  byMethod: { method: string; avulsos: number; renovacoes: number; total: number }[]
  cashExpected: number
} {
  const merged = new Map<string, { method: string; avulsos: number; renovacoes: number; total: number }>()
  for (const r of avulsos) {
    merged.set(r.payment_method, { method: r.payment_method, avulsos: r.total, renovacoes: 0, total: r.total })
  }
  for (const r of renovacoes) {
    const cur = merged.get(r.payment_method) ?? { method: r.payment_method, avulsos: 0, renovacoes: 0, total: 0 }
    cur.renovacoes += r.total
    cur.total += r.total
    merged.set(r.payment_method, cur)
  }
  return {
    byMethod: [...merged.values()].sort((a, b) => b.total - a.total),
    cashExpected: merged.get('Dinheiro')?.total ?? 0
  }
}

/** Caminho único de gravação de fechamento (manual e automático) + sync_log. */
function insertShiftClosureRecord(
  shift: { shiftDate: string; shiftType: string },
  startIso: string,
  endIso: string,
  closedAt: string,
  totals: {
    totalAvulsos: number
    totalRenovacoes: number
    countAvulsos: number
    countRenovacoes: number
    byMethod: unknown
    cashExpected: number
  },
  data: { cashCounted: number | null; operatorName: string | null; auto: boolean }
): ShiftClosureRow {
  const cashDifference = data.cashCounted != null ? data.cashCounted - totals.cashExpected : null
  const result = stmts.insertShiftClosure.run(
    shift.shiftDate,
    shift.shiftType,
    startIso,
    endIso,
    totals.totalAvulsos,
    totals.totalRenovacoes,
    totals.countAvulsos,
    totals.countRenovacoes,
    JSON.stringify(totals.byMethod),
    totals.cashExpected,
    data.cashCounted,
    cashDifference,
    data.operatorName,
    closedAt,
    data.auto ? 1 : 0
  )
  const id = result.lastInsertRowid as number
  const row = stmts.getShiftClosureById.get(id) as ShiftClosureRow
  logSync('shift_closures', id, 'INSERT', { ...row })
  return row
}

function resolveShiftWindowStart(
  last: ShiftClosureRow | undefined,
  shiftStartIso: string,
  nowIso: string
): string {
  if (!last) return shiftStartIso
  return last.end_iso <= nowIso ? last.end_iso : nowIso
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
    if (now.getDate() <= 10) return false
    return !isClientCoveredNow(clientId, undefined, now)
  },

  hasActiveTicket: (placa: string) => {
    const raw = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const row = stmts.getActiveByPlaca.get(raw) as { id: number } | undefined
    return !!row
  },

  createTicket: (placa: string, tipo: string, entrada: string, cpf?: string) => {
    const result = stmts.createTicket.run(placa, tipo, entrada)
    const id = result.lastInsertRowid as number
    const cpfNorm = cpf ? normalizeCpfDigits(cpf) : null
    if (cpfNorm) {
      db.prepare('UPDATE tickets SET cpf = ? WHERE id = ?').run(cpfNorm, id)
    }
    logSync('tickets', id, 'INSERT', { id, placa, tipo, entrada, cpf: cpfNorm, status: 'ATIVO' })
    return id
  },
  checkoutTicket: (id: number, valor: number, saida: string, paymentMethod?: string) => {
    // Sem forma informada: 'Não informado' quando houve cobrança; NULL em saída gratuita.
    const method = paymentMethod ?? (valor > 0 ? 'Não informado' : null)
    stmts.checkoutTicket.run('FINALIZADO', saida, valor, method, id)
    logSync('tickets', id, 'UPDATE', { id, status: 'FINALIZADO', saida, valor, payment_method: method })
  },
  excludeTicket: (id: number) => {
    const saida = new Date().toISOString()
    stmts.excludeTicket.run(saida, id)
    logSync('tickets', id, 'UPDATE', { id, status: 'EXCLUIDO', saida, valor: 0 })
  },
  excludeAllActiveTickets: () => {
    const saida = new Date().toISOString()
    // Buscar IDs antes de excluir para logar cada um
    const activeTickets = stmts.getAllActive.all() as { id: number }[]
    stmts.excludeAllActiveTickets.run(saida)
    for (const t of activeTickets) {
      logSync('tickets', t.id, 'UPDATE', { id: t.id, status: 'EXCLUIDO', saida, valor: 0 })
    }
  },
  getExcludedTickets: () => stmts.getExcludedTickets.all() as { id: number; placa: string; tipo: string; entrada: string; saida: string }[],

  getPlateWasInToday: (placa: string, dateStr: string) => {
    const raw = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    if (!raw || raw.length < 7) return false
    const { start, end } = localDayToIsoRange(dateStr)
    const row = stmts.getPlateWasInToday.get(raw, start, end, start, end)
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
    const normalizedPlates: string[] = []
    for (const plate of data.plates) {
      const raw = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase()
      if (raw) {
        stmts.insertClientVehicle.run(clientId, raw)
        normalizedPlates.push(raw)
      }
    }
    logSync('clients', clientId, 'INSERT', { ...data, id: clientId, plates: normalizedPlates, created_at: createdAt })
    return clientId
  },

  getClients: () => {
    const rows = stmts.getClientsWithVehicles.all() as any[]
    const today = new Date()
    const todayStr = localDateStr(today)
    const expiryDateOnly = (s: string) => (s || '').slice(0, 10)
    // Cobertura em lote: chave/intervalo do mês calculados uma vez e duas
    // consultas GROUP BY no lugar de 2 sondas por cliente (N+1).
    const monthKey = localMonthKey(today)
    const monthRange = localMonthToIsoRange(monthKey)
    const maxCompByClient = new Map(
      (stmts.getMaxCompetencyPerClient.all() as { client_id: number; max_competency: string | null }[]).map(
        (m) => [m.client_id, m.max_competency]
      )
    )
    const paidThisMonth = new Set(
      (stmts.getClientsPaidInMonth.all(monthKey, monthRange.start, monthRange.end) as { client_id: number }[]).map(
        (m) => m.client_id
      )
    )
    return rows.map((r) => {
      const exp = expiryDateOnly(r.expiry_date)
      const isExpired = exp < todayStr
      const isMensalista = typeof r.plan_type === 'string' && r.plan_type.startsWith('MENSAL')
      const isGaragemPlan = r.plan_type === 'GARAGEM'
      const latestPayment = stmts.getLatestPaymentByClientId.get(r.id) as any
      const covered = isCoveredNow({
        expiryDate: r.expiry_date,
        maxPaidCompetency: maxCompByClient.get(r.id) ?? null,
        paidCurrentMonth: paidThisMonth.has(r.id),
        now: today
      })
      let financialStatus = 'Em dia'
      if (isMensalista) {
        financialStatus = financialStatusFor(covered, 10, today)
      } else if (isGaragemPlan && r.garage_billing_day != null) {
        const due = effectiveBillingDayInMonth(today.getFullYear(), today.getMonth(), r.garage_billing_day)
        financialStatus = financialStatusFor(covered, due, today)
      }
      const isDebtor = financialStatus === 'Em atraso'
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
    logSync('clients', clientId, 'UPDATE', { id: clientId, active })
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
    const normalizedPlates: string[] = []
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
          normalizedPlates.push(raw)
        }
      }
    })
    updateTransaction()
    logSync('clients', data.id, 'UPDATE', { ...data, plates: normalizedPlates })
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

  getHistoryForDay: (dateStr: string) => {
    const { start, end } = localDayToIsoRange(dateStr)
    return stmts.getFinishedTicketsForRange.all(start, end)
  },

  getHistoryLast24h: () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    return stmts.getHistoryLast24h.all(since)
  },

  getDailyReport: (dateStr: string) => {
    const { start, end } = localDayToIsoRange(dateStr)
    const avulsosRow = stmts.getTotalAvulsosForRange.get(start, end) as { total: number } | undefined
    const planosRow = stmts.getPlanosVendidosForRange.get(start, end) as { count: number; total: number } | undefined
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
    logSync('daily_reports', dateStr, 'UPDATE', { report_date: dateStr, ...data, created_at: now })
  },

  getDailyUsedMinutes: (placa: string, data: string) => {
    const raw = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const row = stmts.getDailyUsedMinutes.get(raw, data) as { total: number } | undefined
    return row ? row.total : 0
  },

  addDailyUsedMinutes: (placa: string, data: string, minutos: number) => {
    const raw = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    stmts.upsertDailyUsage.run(raw, data, minutos)
    logSync('daily_free_usage', `${raw}:${data}`, 'UPDATE', { placa: raw, data, minutos })
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
    /** Fase 12 — 2ª forma de pagamento (mesma competência); só com months = 1. */
    splitPayment?: { method: string; amount: number } | null
  }) => {
    const now = new Date()
    const paymentDateStr = now.toISOString()
    const notes = data.notes ?? ''
    const months = Math.max(1, Math.floor(data.months || 1))
    const split = data.splitPayment ?? null
    if (split) {
      // Divisão: valida no servidor — 2ª parte positiva e menor que o total,
      // e apenas para renovação de 1 mês (a UI também impede).
      if (months !== 1) throw new Error('Pagamento dividido só está disponível para 1 mês.')
      if (!(split.amount > 0) || split.amount >= data.amount) {
        throw new Error('Valor da segunda forma deve ser maior que zero e menor que o total.')
      }
    }
    const primaryAmount = split ? data.amount - split.amount : data.amount
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
        const result = stmts.insertSubscriptionPayment.run(
          data.clientId,
          primaryAmount,
          data.planType,
          paymentDateStr,
          '',
          data.paymentMethod || 'Não informado',
          competency,
          i > 0 ? 1 : 0,
          notes,
          null
        )
        if (split && i === 0) {
          // 2ª forma: mesma competência, vinculada à linha principal —
          // caixa por forma exato e o vencimento avança UM mês só.
          stmts.insertSubscriptionPayment.run(
            data.clientId,
            split.amount,
            data.planType,
            paymentDateStr,
            '',
            split.method || 'Não informado',
            competency,
            0,
            notes,
            result.lastInsertRowid as number
          )
        }
      }
      const [y, m] = lastComp.split('-').map(Number)
      const exp = new Date(y, m, 10)
      newExpiryStr = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, '0')}-${String(exp.getDate()).padStart(2, '0')}`
    } else {
      const newExpiry = new Date(now)
      newExpiry.setDate(newExpiry.getDate() + 30)
      newExpiryStr = `${newExpiry.getFullYear()}-${String(newExpiry.getMonth() + 1).padStart(2, '0')}-${String(newExpiry.getDate()).padStart(2, '0')}`
      const result = stmts.insertSubscriptionPayment.run(
        data.clientId,
        primaryAmount,
        data.planType,
        paymentDateStr,
        newExpiryStr,
        data.paymentMethod || 'Não informado',
        null,
        0,
        notes,
        null
      )
      if (split) {
        stmts.insertSubscriptionPayment.run(
          data.clientId,
          split.amount,
          data.planType,
          paymentDateStr,
          newExpiryStr,
          split.method || 'Não informado',
          null,
          0,
          notes,
          result.lastInsertRowid as number
        )
      }
    }

    stmts.updateClientExpiry.run(newExpiryStr, data.clientId)
    const clientVehicles = stmts.getClientVehiclesByClientId.all(data.clientId) as { plate: string }[]
    const tipoAtivo = ticketTipoForPlan(data.planType)
    for (const v of clientVehicles) {
      const raw = (v.plate ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
      if (raw) stmts.updateActiveTicketTypeByPlate.run(tipoAtivo, raw)
    }
    logSync('subscription_payments', data.clientId, 'INSERT', {
      clientId: data.clientId,
      planType: data.planType,
      amount: data.amount,
      months,
      paymentMethod: data.paymentMethod,
      splitPayment: split,
      notes,
      newExpiryStr
    })
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
    logSync('clients', clientId, 'DELETE', { id: clientId, name })
  },

  getFinancialSummaryByMethod: (month: number, year: number) => {
    const { start, end } = localMonthToIsoRange(`${year}-${String(month).padStart(2, '0')}`)
    return stmts.getFinancialHistoryByMethod.all(start, end)
  },

  /**
   * Dados financeiros completos de um intervalo [início, fim) ISO UTC,
   * somados no SQL e sem LIMIT (substitui os totais do Financeiro que
   * somavam listas truncadas no JS). Intervalo aberto = todo o histórico.
   */
  getFinanceDataForRange: (start = '0000-01-01', end = '9999-12-31') => {
    const tickets = stmts.getFinishedTicketsForRange.all(start, end) as {
      id: number
      placa: string
      tipo: string
      entrada: string
      saida: string
      valor: number | null
      payment_method: string | null
    }[]
    const payments = stmts.getPaymentsForRange.all(start, end) as any[]
    // Totais/quebra derivados das linhas já buscadas — sem scans SQL extras.
    const byMethodMap = new Map<string, number>()
    for (const p of payments) {
      const m = p.payment_method ?? 'Não informado'
      byMethodMap.set(m, (byMethodMap.get(m) ?? 0) + (p.amount ?? 0))
    }
    const byMethod = [...byMethodMap]
      .map(([payment_method, total]) => ({ payment_method, total }))
      .sort((a, b) => b.total - a.total)
    return {
      totalAvulsos: tickets.reduce((s, t) => s + (t.valor ?? 0), 0),
      countAvulsos: tickets.length,
      totalRenovacoes: payments.reduce((s, p) => s + (p.amount ?? 0), 0),
      countRenovacoes: payments.filter((p) => !p.is_advance && p.split_of == null).length,
      byMethod,
      tickets,
      payments
    }
  },

  /** Dados financeiros do mês civil local. */
  getFinanceMonthData: (month: number, year: number) => {
    const { start, end } = localMonthToIsoRange(`${year}-${String(month).padStart(2, '0')}`)
    return dbOperations.getFinanceDataForRange(start, end)
  },

  // ── Fechamento de caixa por turno ────────────────────────────────────────

  /**
   * Totais do caixa no intervalo — SÓ agregados SQL, sem materializar linhas.
   * Usado pelo fechamento (que persiste apenas agregados).
   */
  getShiftTotals: (start: string, end: string) => {
    const avulsosRow = stmts.getTotalAvulsosForRange.get(start, end) as
      | { count: number; total: number }
      | undefined
    const planosRow = stmts.getPlanosVendidosForRange.get(start, end) as
      | { count: number; total: number }
      | undefined
    const avulsosByMethod = stmts.getAvulsosByMethodForRange.all(start, end) as {
      payment_method: string
      total: number
    }[]
    const renovByMethod = stmts.getFinancialHistoryByMethod.all(start, end) as {
      payment_method: string
      total: number
    }[]
    const { byMethod, cashExpected } = mergeByMethod(avulsosByMethod, renovByMethod)
    const totalAvulsos = avulsosRow?.total ?? 0
    const totalRenovacoes = planosRow?.total ?? 0
    return {
      totalAvulsos,
      countAvulsos: avulsosRow?.count ?? 0,
      totalRenovacoes,
      countRenovacoes: planosRow?.count ?? 0,
      total: totalAvulsos + totalRenovacoes,
      byMethod,
      cashExpected
    }
  },

  /**
   * Dados ao vivo do caixa no intervalo [início, fim) ISO UTC: totais,
   * quebra por forma (avulsos + renovações somados) e transações — tudo
   * derivado das mesmas duas buscas de linhas (sem scans duplicados).
   */
  getShiftLiveData: (start: string, end: string) => {
    const base = dbOperations.getFinanceDataForRange(start, end)
    const avulsosByMethodMap = new Map<string, number>()
    for (const t of base.tickets) {
      if ((t.valor ?? 0) <= 0) continue
      const m = t.payment_method ?? 'Não informado'
      avulsosByMethodMap.set(m, (avulsosByMethodMap.get(m) ?? 0) + (t.valor ?? 0))
    }
    const avulsosByMethod = [...avulsosByMethodMap].map(([payment_method, total]) => ({
      payment_method,
      total
    }))
    const { byMethod, cashExpected } = mergeByMethod(avulsosByMethod, base.byMethod)
    return {
      totalAvulsos: base.totalAvulsos,
      countAvulsos: base.countAvulsos,
      totalRenovacoes: base.totalRenovacoes,
      countRenovacoes: base.countRenovacoes,
      total: base.totalAvulsos + base.totalRenovacoes,
      byMethod,
      cashExpected,
      tickets: base.tickets,
      payments: base.payments
    }
  },

  getLastShiftClosure: () => stmts.getLastShiftClosure.get() as ShiftClosureRow | undefined,

  listShiftClosures: (limit = 20) => stmts.listShiftClosures.all(limit) as ShiftClosureRow[],

  /**
   * Visão do caixa atual para a tela de fechamento: janela ao vivo (o caixa
   * aberto agora), início da janela e histórico. Única fonte do invariante da
   * corrente (compartilhada com closeShift). O caixa está SEMPRE aberto e
   * acumulando desde o fim do último fechamento.
   */
  getShiftOverview: (shift: { shiftDate: string; shiftType: string; startIso: string }) => {
    const nowIso = new Date().toISOString()
    const last = stmts.getLastShiftClosure.get() as ShiftClosureRow | undefined
    const windowStartIso = resolveShiftWindowStart(last, shift.startIso, nowIso)
    const live = dbOperations.getShiftLiveData(windowStartIso, nowIso)
    // Fechamentos NÃO saem no overview: o histórico é área restrita do
    // gerente (senha) — aqui vai só a contagem de automáticos pendentes.
    const pending = stmts.countPendingAutoClosures.get() as { count: number }
    return { windowStartIso, live, pendingCount: pending?.count ?? 0 }
  },

  /**
   * Fecha o caixa atual: INSERT imutável cobrindo [fim do fechamento anterior
   * (ou início natural do turno), agora]. Ao fechar, um caixa novo já começa a
   * acumular a partir de agora — vários caixas por turno são permitidos.
   * Bloqueia apenas o fechamento vazio (sem movimento e sem contagem).
   */
  closeShift: (shift: { shiftDate: string; shiftType: string; startIso: string }, data: {
    cashCounted?: number | null
    operatorName?: string
  }) => {
    const last = stmts.getLastShiftClosure.get() as ShiftClosureRow | undefined
    const closedAt = new Date().toISOString()
    const windowStart = resolveShiftWindowStart(last, shift.startIso, closedAt)
    // Só agregados: o fechamento não persiste linhas, então não as materializa.
    const live = dbOperations.getShiftTotals(windowStart, closedAt)
    const cashCounted = data.cashCounted ?? null
    if (live.total === 0 && cashCounted == null) {
      return { success: false as const, error: 'Não há movimento neste caixa para fechar.' }
    }
    try {
      const closure = insertShiftClosureRecord(shift, windowStart, closedAt, closedAt, live, {
        cashCounted,
        operatorName: data.operatorName?.trim() || null,
        auto: false
      })
      return { success: true as const, closure }
    } catch (e) {
      console.error('Erro ao gravar fechamento de caixa:', e)
      return { success: false as const, error: 'Não foi possível registrar o fechamento.' }
    }
  },

  /**
   * Fase 10 — fechamento AUTOMÁTICO na troca de turno. Percorre as viradas
   * (07:00/19:00) já passadas desde o fim do último fechamento e corta o
   * caixa em cada uma que tenha movimento, marcando auto_closed = 1
   * (pendente de confirmação do operador). Viradas sem movimento não geram
   * registro — a janela seguinte as absorve. Roda no startup (catch-up) e a
   * cada minuto com o app aberto; idempotente.
   */
  autoCloseDueShifts: (dayStartHour: number, nightStartHour: number) => {
    const created: ShiftClosureRow[] = []
    try {
      const now = new Date()
      const nowIso = now.toISOString()
      const last = stmts.getLastShiftClosure.get() as ShiftClosureRow | undefined
      // Sem fechamento anterior: âncora no início natural do turno atual
      // (não força cortes de dias antigos no primeiro uso).
      let anchor = last
        ? resolveShiftWindowStart(last, currentShift(now, dayStartHour, nightStartHour).startIso, nowIso)
        : currentShift(now, dayStartHour, nightStartHour).startIso
      // Percorre as viradas passadas; viradas sem movimento não geram
      // registro (a janela vazia é absorvida pela próxima com movimento).
      let cursor = new Date(anchor)
      for (let guard = 0; guard < 400; guard++) {
        const boundary = nextShiftBoundaryAfter(cursor, dayStartHour, nightStartHour)
        if (boundary.getTime() > now.getTime()) break
        const boundaryIso = boundary.toISOString()
        const totals = dbOperations.getShiftTotals(anchor, boundaryIso)
        if (totals.total > 0) {
          // Turno que TERMINOU nesta virada (um instante antes dela)
          const endedShift = currentShift(new Date(boundary.getTime() - 60000), dayStartHour, nightStartHour)
          created.push(
            insertShiftClosureRecord(endedShift, anchor, boundaryIso, nowIso, totals, {
              cashCounted: null,
              operatorName: null,
              auto: true
            })
          )
          anchor = boundaryIso
        }
        cursor = boundary
      }
    } catch (e) {
      console.error('Erro no fechamento automático de turno:', e)
    }
    return created
  },

  /**
   * Confirma um fechamento AUTOMÁTICO pendente: operador obrigatório e
   * conferência de dinheiro opcional. Única atualização permitida em
   * shift_closures — os totais permanecem imutáveis.
   */
  confirmShiftClosure: (id: number, data: { operatorName: string; cashCounted?: number | null }) => {
    const operator = data.operatorName?.trim()
    if (!operator) return { success: false as const, error: 'Informe o nome de quem confirma.' }
    const row = stmts.getShiftClosureById.get(id) as ShiftClosureRow | undefined
    if (!row) return { success: false as const, error: 'Fechamento não encontrado.' }
    if (!row.auto_closed) return { success: false as const, error: 'Este fechamento já foi feito manualmente.' }
    if (row.confirmed_at) return { success: false as const, error: 'Este fechamento já foi confirmado.' }
    const confirmedAt = new Date().toISOString()
    const cashCounted = data.cashCounted ?? null
    const cashDifference =
      cashCounted != null && row.cash_counted == null ? cashCounted - (row.cash_expected ?? 0) : null
    stmts.confirmShiftClosure.run(operator, confirmedAt, cashCounted, cashDifference, id)
    logSync('shift_closures', id, 'UPDATE', {
      id,
      confirmed_by: operator,
      confirmed_at: confirmedAt,
      cash_counted: cashCounted,
      cash_difference: cashDifference
    })
    const closure = stmts.getShiftClosureById.get(id) as ShiftClosureRow
    return { success: true as const, closure }
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
    const createdAt = new Date().toISOString()
    const result = stmts.insertFamilyGroup.run(raw, createdAt)
    const id = result.lastInsertRowid as number
    logSync('family_groups', id, 'INSERT', { id, plate: raw, created_at: createdAt })
    return { id }
  },

  addFamilyMember: (groupId: number, name: string, cpf: string) => {
    const cpfNorm = normalizeCpfDigits(cpf)
    const createdAt = new Date().toISOString()
    const result = stmts.insertFamilyMember.run(groupId, name, cpfNorm, createdAt)
    const id = result.lastInsertRowid as number
    logSync('family_members', id, 'INSERT', { id, group_id: groupId, name, cpf: cpfNorm, created_at: createdAt })
    return { id }
  },

  updateFamilyMember: (memberId: number, name: string, cpf: string) => {
    const cpfNorm = normalizeCpfDigits(cpf)
    stmts.updateFamilyMember.run(name, cpfNorm, memberId)
    logSync('family_members', memberId, 'UPDATE', { id: memberId, name, cpf: cpfNorm })
  },

  memberHasActiveTicket: (memberId: number): { blocked: boolean; cpf?: string } => {
    const member = stmts.getMemberById.get(memberId) as { cpf?: string } | undefined
    if (!member?.cpf) return { blocked: false }
    const row = stmts.hasActiveTicketByCpf.get(member.cpf) as { id: number } | undefined
    return row ? { blocked: true, cpf: member.cpf } : { blocked: false }
  },

  deleteFamilyMember: (memberId: number) => {
    stmts.deleteFamilyMember.run(memberId)
    logSync('family_members', memberId, 'DELETE', { id: memberId })
  },

  deleteFamilyGroup: (groupId: number) => {
    const tx = db.transaction((id: number) => {
      stmts.deleteFamilyMembersByGroup.run(id)
      stmts.deleteFamilyGroup.run(id)
    })
    tx(groupId)
    logSync('family_groups', groupId, 'DELETE', { id: groupId })
  },

  // ── Sync LAN: operações do log de mudanças ──────────────────────────────

  /** Retorna entradas do sync_log com seq > afterSeq (para replicação incremental). */
  getSyncLogAfter: (afterSeq: number, limit = 500) => {
    return db
      .prepare('SELECT * FROM sync_log WHERE seq > ? ORDER BY seq ASC LIMIT ?')
      .all(afterSeq, limit) as {
      seq: number
      node_id: string
      timestamp: string
      table_name: string
      row_id: string
      operation: string
      payload: string
    }[]
  },

  /** Retorna o maior seq do sync_log (para saber até onde já sincronizou). */
  getMaxSyncSeq: () => {
    const row = db.prepare('SELECT COALESCE(MAX(seq), 0) as max_seq FROM sync_log').get() as { max_seq: number }
    return row.max_seq
  },

  /** Retorna o NODE_ID desta instalação. */
  getNodeId: () => NODE_ID,

  /**
   * Consolida o WAL no arquivo principal e fecha a conexão. Chamado ao sair
   * para o parking.db ficar íntegro sozinho (importante porque o banco é
   * copiado manualmente/por pendrive) e não deixar -wal para trás.
   */
  closeDatabase: () => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.close()
    } catch (e) {
      console.warn('[db] Falha ao fechar o banco:', e)
    }
  }
}

export default db
