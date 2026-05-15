/**
 * Servidor de sincronização LAN.
 *
 * Quando o app é configurado como "servidor", este módulo sobe:
 *  - Um HTTP server (porta 3457) com endpoints REST para leitura/escrita do banco
 *  - Um WebSocket server (mesma porta, upgrade) para notificações em tempo real
 *
 * Clientes conectados recebem broadcast de toda nova entrada no sync_log,
 * e podem puxar histórico incremental via GET /sync/log?after=<seq>.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { networkInterfaces } from 'os'
import { dbOperations } from './db'
import { NODE_ID } from './db'

const SYNC_PORT = 3457

let httpServer: ReturnType<typeof createServer> | null = null
let wss: WebSocketServer | null = null
let isRunning = false

// ── Helpers ──────────────────────────────────────────────────────────────

function getLocalIPs(): string[] {
  const nets = networkInterfaces()
  const ips: string[] = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address)
      }
    }
  }
  return ips
}

function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify(data))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

// ── Broadcast para clientes WebSocket ────────────────────────────────────

function broadcastSyncEntry(entry: {
  seq: number
  node_id: string
  timestamp: string
  table_name: string
  row_id: string
  operation: string
  payload: string
}): void {
  if (!wss) return
  const msg = JSON.stringify({ type: 'sync', data: entry })
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  }
}

// Hook chamado após cada logSync() no db.ts — será registrado ao iniciar o servidor
let lastBroadcastSeq = 0

function pollAndBroadcastNewEntries(): void {
  try {
    const entries = dbOperations.getSyncLogAfter(lastBroadcastSeq, 100)
    for (const entry of entries) {
      // Não rebroadcast entradas que vieram de outros nós (já aplicadas via sync)
      if (entry.node_id === NODE_ID) {
        broadcastSyncEntry(entry)
      }
      lastBroadcastSeq = entry.seq
    }
  } catch (e) {
    console.error('[sync-server] Erro ao broadcast:', e)
  }
}

// ── Rotas HTTP ───────────────────────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const method = req.method ?? 'GET'

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
    res.end()
    return
  }

  try {
    // ── Info ──
    if (url.pathname === '/ping' && method === 'GET') {
      return jsonResponse(res, 200, { ok: true, nodeId: NODE_ID, timestamp: new Date().toISOString() })
    }

    // ── Sync Log (replicação incremental) ──
    if (url.pathname === '/sync/log' && method === 'GET') {
      const after = parseInt(url.searchParams.get('after') ?? '0', 10)
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500', 10), 1000)
      const entries = dbOperations.getSyncLogAfter(after, limit)
      return jsonResponse(res, 200, { entries, nodeId: NODE_ID })
    }

    if (url.pathname === '/sync/seq' && method === 'GET') {
      return jsonResponse(res, 200, { seq: dbOperations.getMaxSyncSeq(), nodeId: NODE_ID })
    }

    // ── Aplicar mudanças recebidas de outro nó ──
    if (url.pathname === '/sync/apply' && method === 'POST') {
      const body = JSON.parse(await readBody(req))
      const entries = body.entries as {
        node_id: string
        timestamp: string
        table_name: string
        row_id: string
        operation: string
        payload: string
      }[]

      if (!Array.isArray(entries)) {
        return jsonResponse(res, 400, { error: 'entries deve ser um array' })
      }

      let applied = 0
      for (const entry of entries) {
        // Não reaplicar mudanças deste próprio nó
        if (entry.node_id === NODE_ID) continue
        try {
          applySyncEntry(entry)
          applied++
        } catch (e) {
          console.error('[sync-server] Erro ao aplicar entry:', entry, e)
        }
      }
      return jsonResponse(res, 200, { applied, seq: dbOperations.getMaxSyncSeq() })
    }

    // ── Dados: leitura para sync inicial (full dump) ──
    if (url.pathname === '/sync/full-dump' && method === 'GET') {
      const tickets = dbOperations.getAllActiveTickets()
      const clients = dbOperations.getClients()
      const seq = dbOperations.getMaxSyncSeq()
      return jsonResponse(res, 200, { tickets, clients, seq, nodeId: NODE_ID })
    }

    // 404
    return jsonResponse(res, 404, { error: 'Rota não encontrada' })
  } catch (e) {
    console.error('[sync-server] Erro na rota:', e)
    return jsonResponse(res, 500, { error: 'Erro interno do servidor' })
  }
}

// ── Aplicar uma entrada de sync no banco local ──────────────────────────

import db from './db'

function applySyncEntry(entry: {
  node_id: string
  timestamp: string
  table_name: string
  row_id: string
  operation: string
  payload: string
}): void {
  const payload = typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload
  const table = entry.table_name
  const op = entry.operation

  switch (table) {
    case 'tickets':
      applyTicketSync(op, payload)
      break
    case 'clients':
      applyClientSync(op, payload)
      break
    case 'subscription_payments':
      applyPaymentSync(op, payload)
      break
    case 'daily_reports':
      applyDailyReportSync(payload)
      break
    case 'daily_free_usage':
      applyDailyUsageSync(payload)
      break
    case 'family_groups':
      applyFamilyGroupSync(op, payload)
      break
    case 'family_members':
      applyFamilyMemberSync(op, payload)
      break
    default:
      console.warn(`[sync] Tabela desconhecida: ${table}`)
  }

  // Registrar no sync_log local que esta entrada veio de outro nó
  db.prepare(
    'INSERT INTO sync_log (node_id, timestamp, table_name, row_id, operation, payload) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(entry.node_id, entry.timestamp, entry.table_name, entry.row_id, entry.operation, typeof entry.payload === 'string' ? entry.payload : JSON.stringify(entry.payload))
}

function applyTicketSync(op: string, p: Record<string, unknown>): void {
  if (op === 'INSERT') {
    // Verifica se já existe (idempotência)
    const existing = db.prepare('SELECT id FROM tickets WHERE id = ?').get(p.id)
    if (existing) return
    db.prepare(
      'INSERT INTO tickets (id, placa, tipo, entrada, status, cpf) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(p.id, p.placa, p.tipo, p.entrada, p.status ?? 'ATIVO', p.cpf ?? null)
  } else if (op === 'UPDATE') {
    db.prepare(
      'UPDATE tickets SET status = ?, saida = ?, valor = ? WHERE id = ?'
    ).run(p.status, p.saida ?? null, p.valor ?? 0, p.id)
  }
}

function applyClientSync(op: string, p: Record<string, unknown>): void {
  if (op === 'INSERT') {
    const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(p.id)
    if (existing) return
    db.prepare(
      'INSERT INTO clients (id, name, cpf, phone, plan_type, expiry_date, active, created_at, garage_billing_day, garage_billing_month) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)'
    ).run(
      p.id, p.name, p.cpf ?? '', p.phone ?? '', p.plan_type, p.expiry_date,
      p.created_at ?? new Date().toISOString(), p.garage_billing_day ?? null, p.garage_billing_month ?? null
    )
    // Inserir placas
    const plates = (p.plates as string[]) ?? []
    for (const plate of plates) {
      try {
        db.prepare('INSERT OR IGNORE INTO client_vehicles (client_id, plate) VALUES (?, ?)').run(p.id, plate)
      } catch { /* placa duplicada — ignora */ }
    }
  } else if (op === 'UPDATE') {
    if (p.active !== undefined && Object.keys(p).length <= 2) {
      // Apenas toggle de ativo/inativo
      db.prepare('UPDATE clients SET active = ? WHERE id = ?').run(p.active, p.id)
    } else {
      // Update completo
      db.prepare(
        'UPDATE clients SET name = ?, cpf = ?, phone = ?, plan_type = ?, expiry_date = ?, garage_billing_day = ?, garage_billing_month = ? WHERE id = ?'
      ).run(p.name, p.cpf ?? '', p.phone ?? '', p.plan_type, p.expiry_date, p.garage_billing_day ?? null, p.garage_billing_month ?? null, p.id)
      // Atualizar placas
      if (Array.isArray(p.plates)) {
        db.prepare('DELETE FROM client_vehicles WHERE client_id = ?').run(p.id)
        for (const plate of p.plates as string[]) {
          try {
            db.prepare('INSERT OR IGNORE INTO client_vehicles (client_id, plate) VALUES (?, ?)').run(p.id, plate)
          } catch { /* ignora duplicata */ }
        }
      }
    }
  } else if (op === 'DELETE') {
    const name = (p.name as string) ?? 'Cliente'
    db.prepare('UPDATE subscription_payments SET payer_display_name = ? WHERE client_id = ?').run(name, p.id)
    db.prepare('DELETE FROM client_vehicles WHERE client_id = ?').run(p.id)
    db.prepare('DELETE FROM clients WHERE id = ?').run(p.id)
  }
}

function applyPaymentSync(op: string, p: Record<string, unknown>): void {
  if (op === 'INSERT') {
    // Reaplicar a renovação completa — atualizar expiry
    const clientId = p.clientId as number
    const newExpiryStr = p.newExpiryStr as string
    if (newExpiryStr && clientId) {
      db.prepare('UPDATE clients SET expiry_date = ?, active = 1 WHERE id = ?').run(newExpiryStr, clientId)
    }
    // Nota: os pagamentos individuais já foram inseridos no nó de origem.
    // No sync, replicamos o efeito (atualizar expiry) sem duplicar pagamentos.
    // Pagamentos são inseridos separadamente se necessário.
  }
}

function applyDailyReportSync(p: Record<string, unknown>): void {
  db.prepare(`
    INSERT INTO daily_reports (report_date, total_avulsos, planos_vendidos_count, planos_vendidos_value, qty_cars, qty_motos, created_at)
    VALUES (date(?), ?, ?, ?, ?, ?, ?)
    ON CONFLICT(report_date) DO UPDATE SET
      total_avulsos = excluded.total_avulsos,
      planos_vendidos_count = excluded.planos_vendidos_count,
      planos_vendidos_value = excluded.planos_vendidos_value,
      qty_cars = excluded.qty_cars,
      qty_motos = excluded.qty_motos,
      created_at = excluded.created_at
  `).run(
    p.report_date, p.totalAvulsos ?? 0, p.planosVendidosCount ?? 0,
    p.planosVendidosValue ?? 0, p.qtyCars ?? 0, p.qtyMotos ?? 0, p.created_at ?? new Date().toISOString()
  )
}

function applyDailyUsageSync(p: Record<string, unknown>): void {
  db.prepare(`
    INSERT INTO daily_free_usage (placa, data, minutos_usados) VALUES (?, ?, ?)
    ON CONFLICT(placa, data) DO UPDATE SET minutos_usados = minutos_usados + excluded.minutos_usados
  `).run(p.placa, p.data, p.minutos)
}

function applyFamilyGroupSync(op: string, p: Record<string, unknown>): void {
  if (op === 'INSERT') {
    const existing = db.prepare('SELECT id FROM family_groups WHERE id = ?').get(p.id)
    if (existing) return
    db.prepare('INSERT INTO family_groups (id, plate, created_at) VALUES (?, ?, ?)').run(
      p.id, p.plate, p.created_at ?? new Date().toISOString()
    )
  } else if (op === 'DELETE') {
    db.prepare('DELETE FROM family_members WHERE group_id = ?').run(p.id)
    db.prepare('DELETE FROM family_groups WHERE id = ?').run(p.id)
  }
}

function applyFamilyMemberSync(op: string, p: Record<string, unknown>): void {
  if (op === 'INSERT') {
    const existing = db.prepare('SELECT id FROM family_members WHERE id = ?').get(p.id)
    if (existing) return
    try {
      db.prepare('INSERT INTO family_members (id, group_id, name, cpf, created_at) VALUES (?, ?, ?, ?, ?)').run(
        p.id, p.group_id, p.name, p.cpf, p.created_at ?? new Date().toISOString()
      )
    } catch { /* CPF duplicado — ignora */ }
  } else if (op === 'UPDATE') {
    db.prepare('UPDATE family_members SET name = ?, cpf = ? WHERE id = ?').run(p.name, p.cpf, p.id)
  } else if (op === 'DELETE') {
    db.prepare('DELETE FROM family_members WHERE id = ?').run(p.id)
  }
}

// ── Iniciar / Parar servidor ─────────────────────────────────────────────

let pollInterval: ReturnType<typeof setInterval> | null = null

export function startSyncServer(): { port: number; ips: string[] } {
  if (isRunning) return { port: SYNC_PORT, ips: getLocalIPs() }

  httpServer = createServer((req, res) => {
    handleRequest(req, res).catch((e) => {
      console.error('[sync-server] Erro:', e)
      jsonResponse(res, 500, { error: 'Erro interno' })
    })
  })

  wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws) => {
    console.log('[sync-server] Cliente conectado')
    // Enviar info inicial
    ws.send(JSON.stringify({
      type: 'welcome',
      nodeId: NODE_ID,
      seq: dbOperations.getMaxSyncSeq()
    }))

    ws.on('close', () => {
      console.log('[sync-server] Cliente desconectado')
    })

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'apply') {
          // Cliente enviando mudanças para o servidor
          const entries = msg.entries ?? []
          for (const entry of entries) {
            if (entry.node_id === NODE_ID) continue
            try {
              applySyncEntry(entry)
            } catch (e) {
              console.error('[sync-server] Erro ao aplicar via WS:', e)
            }
          }
          ws.send(JSON.stringify({ type: 'ack', seq: dbOperations.getMaxSyncSeq() }))
        }
      } catch (e) {
        console.error('[sync-server] Mensagem inválida:', e)
      }
    })
  })

  httpServer.listen(SYNC_PORT, '0.0.0.0', () => {
    const ips = getLocalIPs()
    console.log(`[sync-server] Rodando na porta ${SYNC_PORT}`)
    console.log(`[sync-server] IPs locais: ${ips.join(', ')}`)
    console.log(`[sync-server] Node ID: ${NODE_ID}`)
  })

  // Poll a cada 500ms por novas entradas no sync_log para broadcast
  lastBroadcastSeq = dbOperations.getMaxSyncSeq()
  pollInterval = setInterval(pollAndBroadcastNewEntries, 500)

  isRunning = true
  return { port: SYNC_PORT, ips: getLocalIPs() }
}

export function stopSyncServer(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  if (wss) {
    wss.close()
    wss = null
  }
  if (httpServer) {
    httpServer.close()
    httpServer = null
  }
  isRunning = false
  console.log('[sync-server] Parado')
}

export function isSyncServerRunning(): boolean {
  return isRunning
}

export function getSyncServerInfo(): { running: boolean; port: number; ips: string[]; nodeId: string } {
  return {
    running: isRunning,
    port: SYNC_PORT,
    ips: getLocalIPs(),
    nodeId: NODE_ID
  }
}
