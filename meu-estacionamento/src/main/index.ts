import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'

/**
 * Cache do Chromium na pasta do app (userData), fora de pastas sincronizadas (ex.: OneDrive),
 * evita "Unable to move the cache: Acesso negado" e falhas de GPU cache no Windows.
 */
function configureStableCachePaths(): void {
  try {
    const base = app.getPath('userData')
    const browserCache = path.join(base, 'browser-cache')
    mkdirSync(browserCache, { recursive: true })
    app.setPath('cache', browserCache)
    app.commandLine.appendSwitch('disk-cache-dir', browserCache)
    // Evita criação de cache de shader em diretório bloqueado (mensagens gpu_disk_cache / disk_cache).
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
  } catch (e) {
    console.warn('Não foi possível configurar pastas de cache:', e)
  }
}

configureStableCachePaths()
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { dbOperations, translateDbError } from './db'
import { localDateStr } from './clientStatus'
import { calcularValor, splitStayIntoLocalDaySegments } from './calculations'
import { printEntryTicket, printExitTicket, printSubscriptionReceipt, printShiftClosureReceipt, type ShiftClosureReceiptData } from './printer'
import { currentShift, shiftLabel } from './shifts'
import { getConfig, saveConfig } from './config'
import { startSyncServer, stopSyncServer, getSyncServerInfo } from './syncServer'


let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const winIcon =
    process.platform === 'win32'
      ? (() => {
          const icoPath = path.join(is.dev ? process.cwd() : path.dirname(app.getAppPath()), 'build', 'icon.ico')
          return existsSync(icoPath) ? icoPath : icon
        })()
      : process.platform === 'linux'
        ? icon
        : undefined

  const win = new BrowserWindow({
    width: 1400,
    height: 800,
    show: false,
    title: 'KF Estacionamento',
    autoHideMenuBar: true,
    ...(winIcon ? { icon: winIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mainWindow = win

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.kf.estacionamento')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Handlers IPC para o sistema de estacionamento
  ipcMain.handle('get-tickets', () => {
    try {
      return dbOperations.getAllActiveTickets()
    } catch (error) {
      console.error('Erro ao buscar tickets:', error)
      return []
    }
  })

  const normalizePlate = (p: string) => p.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  const normalizeCpf = (c?: string) => (c ? c.replace(/\D/g, '') : undefined)

  ipcMain.handle('create-ticket', (_event, { placa, tipo, cpf }: { placa: string; tipo: string; cpf?: string }) => {
    try {
      const placaNorm = normalizePlate(placa)
      if (!placaNorm) return { success: false, error: 'Placa inválida' }
      if (placaNorm.length < 7) {
        return { success: false, error: 'Placa incompleta. Digite os 7 caracteres da placa.' }
      }
      if (dbOperations.hasActiveTicket(placaNorm)) {
        return { success: false, message: 'Veículo já está no pátio!' }
      }
      const sub = dbOperations.getVehicleSubscription(placaNorm)
      const subscriberDebtor = !!(
        sub?.isDebtor &&
        (sub?.planType?.startsWith('MENSAL') || sub?.planType === 'GARAGEM')
      )
      const entrada = new Date().toISOString()
      const cpfNorm = normalizeCpf(cpf)
      const id = dbOperations.createTicket(placaNorm, tipo, entrada, cpfNorm)
      return { success: true, id, entrada, billedAsAvulso: subscriberDebtor }
    } catch (error) {
      console.error('Erro ao criar ticket:', error)
      return { success: false, error: String(error) }
    }
  })

  function getFreeMinutesForTicket(placa: string, tipo: string): number {
    if (tipo === 'MENSALISTA' || tipo === 'GARAGEM') {
      const sub = dbOperations.getVehicleSubscription(normalizePlate(placa))
      return sub ? sub.freeMinutes : 90
    }
    return 90
  }

  function isAvulsoParaPernoite(tipo: string): boolean {
    return tipo === 'Carro' || tipo === 'Moto'
  }

  function usaControleDiario(tipo: string): boolean {
    return tipo === 'Carro' || tipo === 'Moto' || tipo === 'MENSALISTA' || tipo === 'GARAGEM'
  }

  ipcMain.handle(
    'checkout-ticket',
    (_event, { id, paymentMethod }: { id: number; paymentMethod?: string }) => {
      try {
        const tickets = dbOperations.getAllActiveTickets()
        const ticket = tickets.find((t: any) => t.id === id)

        if (!ticket) {
          return { success: false, error: 'Ticket não encontrado' }
        }

        const saida = new Date().toISOString()

        const freeMinutes = getFreeMinutesForTicket(ticket.placa, ticket.tipo)
        const aplicarPernoite = isAvulsoParaPernoite(ticket.tipo)
        const ticketCpf = normalizeCpf((ticket as any).cpf)
        const usageKey = ticketCpf ?? ticket.placa
        const getDailyForDate = (dateKey: string) =>
          dbOperations.getDailyUsedMinutes(usageKey, dateKey)
        const valor = calcularValor(
          ticket.entrada,
          freeMinutes,
          saida,
          getDailyForDate,
          aplicarPernoite
        )

        dbOperations.checkoutTicket(id, valor, saida, paymentMethod)

        if (usaControleDiario(ticket.tipo) && freeMinutes < 999999) {
          const segs = splitStayIntoLocalDaySegments(ticket.entrada, saida)
          for (const seg of segs) {
            dbOperations.addDailyUsedMinutes(usageKey, seg.dateKey, seg.minutes)
          }
        }

        return { success: true, valor }
      } catch (error) {
        console.error('Erro ao fazer checkout:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  ipcMain.handle(
    'calculate-value',
    (
      _event,
      data: { entrada: string; placa?: string; tipo?: string; cpf?: string }
    ) => {
      try {
        const tipo = data.tipo ?? 'Carro'
        const placa = data.placa ?? ''
        const cpfNorm = normalizeCpf(data.cpf)
        const usageKey = cpfNorm ?? placa
        const freeMinutes =
          (tipo === 'MENSALISTA' || tipo === 'GARAGEM') && placa
            ? (dbOperations.getVehicleSubscription(normalizePlate(placa))?.freeMinutes ?? 90)
            : 90
        const agora = new Date().toISOString()
        const getDailyForDate = (dateKey: string) =>
          usageKey ? dbOperations.getDailyUsedMinutes(usageKey, dateKey) : 0
        const aplicarPernoite = tipo === 'Carro' || tipo === 'Moto'
        const valor = calcularValor(
          data.entrada,
          freeMinutes,
          agora,
          getDailyForDate,
          aplicarPernoite
        )
        return { valor }
      } catch (error) {
        console.error('Erro ao calcular valor:', error)
        return { valor: 0 }
      }
    }
  )

  ipcMain.handle('check-plate-was-in-today', (_event, placa: string) => {
    try {
      const today = localDateStr(new Date())
      return dbOperations.getPlateWasInToday(normalizePlate(placa), today)
    } catch (error) {
      console.error('Erro ao verificar placa no dia:', error)
      return false
    }
  })

  ipcMain.handle('check-plate-subscription', (_event, placa: string) => {
    try {
      const sub = dbOperations.getVehicleSubscription(normalizePlate(placa))
      if (!sub) {
        return {
          isSubscriber: false,
          clientId: undefined,
          clientName: '',
          planType: '',
          isExpired: false,
          expiryDate: '',
          freeMinutes: 90,
          isDebtor: false
        }
      }
      return {
        isSubscriber: true,
        clientId: sub.clientId,
        clientName: sub.clientName,
        planType: sub.planType,
        isExpired: sub.isExpired,
        expiryDate: sub.expiryDate,
        freeMinutes: sub.freeMinutes,
        isDebtor: !!sub.isDebtor
      }
    } catch (error) {
      console.error('Erro ao verificar placa:', error)
      return {
        isSubscriber: false,
        clientId: undefined,
        clientName: '',
        planType: '',
        isExpired: false,
        expiryDate: '',
        freeMinutes: 90,
        isDebtor: false
      }
    }
  })

  ipcMain.handle(
    'create-client',
    (
      _event,
      data: {
        name: string
        cpf: string
        phone: string
        plan_type: string
        expiry_date: string
        plates: string[]
        garage_billing_day?: number | null
        garage_billing_month?: number | null
      }
    ) => {
      try {
        const id = dbOperations.createClient(data)
        return { success: true, id }
      } catch (error) {
        console.error('Erro ao criar cliente:', error)
        return { success: false, error: translateDbError(error) }
      }
    }
  )

  ipcMain.handle('get-clients', () => {
    try {
      return dbOperations.getClients()
    } catch (error) {
      console.error('Erro ao buscar clientes:', error)
      throw error
    }
  })

  ipcMain.handle(
    'update-client',
    (
      _event,
      data: {
        id: number
        name: string
        cpf: string
        phone: string
        plan_type: string
        expiry_date: string
        plates: string[]
        garage_billing_day?: number | null
        garage_billing_month?: number | null
      }
    ) => {
      try {
        dbOperations.updateClient(data)
        return { success: true }
      } catch (error) {
        console.error('Erro ao atualizar cliente:', error)
        return { success: false, error: translateDbError(error) }
      }
    }
  )

  ipcMain.handle(
    'toggle-client-status',
    (_event, { clientId, active }: { clientId: number; active: number }) => {
      try {
        dbOperations.updateClientActive(clientId, active)
        return { success: true }
      } catch (error) {
        console.error('Erro ao alterar status do cliente:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  ipcMain.handle(
    'renew-subscription',
    (
      _event,
      data: {
        clientId: number
        planType: string
        amount: number
        months?: number
        paymentMethod?: string
        notes?: string
      }
    ) => {
      try {
        const newExpiry = dbOperations.renewSubscriptionAdvanced({
          clientId: data.clientId,
          planType: data.planType,
          amount: data.amount,
          months: data.months ?? 1,
          paymentMethod: data.paymentMethod ?? 'Não informado',
          notes: data.notes ?? ''
        })
        return { success: true, newExpiry }
      } catch (error) {
        console.error('Erro ao renovar:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  ipcMain.handle('get-financial-history', () => {
    try {
      return dbOperations.getFinancialHistory()
    } catch (error) {
      console.error('Erro ao buscar histórico financeiro:', error)
      return []
    }
  })

  ipcMain.handle(
    'get-financial-summary-by-method',
    (_event, data: { month: number; year: number }) => {
      try {
        return dbOperations.getFinancialSummaryByMethod(data.month, data.year)
      } catch (error) {
        console.error('Erro ao buscar resumo por método:', error)
        return []
      }
    }
  )

  ipcMain.handle('get-finance-month-data', (_event, data: { month: number; year: number }) => {
    try {
      return dbOperations.getFinanceMonthData(data.month, data.year)
    } catch (error) {
      console.error('Erro ao buscar dados financeiros do mês:', error)
      return {
        totalAvulsos: 0,
        countAvulsos: 0,
        totalRenovacoes: 0,
        countRenovacoes: 0,
        byMethod: [],
        tickets: [],
        payments: []
      }
    }
  })

  // ── Fechamento de caixa por turno ──────────────────────────────────────

  ipcMain.handle('get-shift-overview', () => {
    try {
      const cfg = getConfig()
      const dayStart = cfg.shiftDayStartHour ?? 7
      const nightStart = cfg.shiftNightStartHour ?? 19
      const shift = currentShift(new Date(), dayStart, nightStart)
      return {
        shift: { ...shift, label: shiftLabel(shift.shiftType, dayStart, nightStart) },
        ...dbOperations.getShiftOverview(shift)
      }
    } catch (error) {
      console.error('Erro ao buscar visão do turno:', error)
      return null
    }
  })

  ipcMain.handle(
    'close-shift',
    (_event, data: { cashCounted?: number | null; operatorName?: string }) => {
      try {
        const cfg = getConfig()
        const shift = currentShift(
          new Date(),
          cfg.shiftDayStartHour ?? 7,
          cfg.shiftNightStartHour ?? 19
        )
        return dbOperations.closeShift(shift, {
          cashCounted: data?.cashCounted ?? null,
          operatorName: data?.operatorName
        })
      } catch (error) {
        console.error('Erro ao fechar turno:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  ipcMain.handle('print-shift-closure', async (_event, data: ShiftClosureReceiptData) => {
    try {
      await printShiftClosureReceipt(data)
      return { success: true }
    } catch (error) {
      console.error('Erro ao imprimir fechamento:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('get-client-statement', (_event, clientId: number) => {
    try {
      return dbOperations.getClientStatement(clientId)
    } catch (error) {
      console.error('Erro ao buscar extrato do cliente:', error)
      return null
    }
  })

  ipcMain.handle('export-financial-csv', async (_event, data?: { month?: number; year?: number }) => {
    try {
      // Com mês/ano exporta o mês local completo; sem filtro, todo o histórico (sem LIMIT).
      const monthData =
        data?.month && data?.year
          ? dbOperations.getFinanceMonthData(data.month, data.year)
          : dbOperations.getFinanceDataForRange()
      const rows: { date: string; type: string; description: string; value: number }[] = []
      monthData.tickets.forEach((t) => {
        rows.push({
          date: t.saida ?? t.entrada,
          type: 'Avulso',
          description: `Ticket ${t.placa}${t.payment_method ? ` - ${t.payment_method}` : ''}`,
          value: t.valor ?? 0
        })
      })
      monthData.payments.forEach((p) => {
        rows.push({
          date: p.payment_date,
          type: 'Renovação',
          description: `${p.client_name ?? ''}${p.payment_method ? ` - ${p.payment_method}` : ''}${p.competency_month ? ` - Comp ${p.competency_month}` : ''}`,
          value: p.amount ?? 0
        })
      })
      rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      const header = 'Data;Tipo;Descrição;Valor (R$)'
      const lines = rows.map(
        (r) =>
          `${new Date(r.date).toLocaleString('pt-BR')};${r.type};"${(r.description ?? '').replace(/"/g, '""')}";${(r.value ?? 0).toFixed(2).replace('.', ',')}`
      )
      const csv = [header, ...lines].join('\n')
      const suffix =
        data?.month && data?.year
          ? `${data.year}-${String(data.month).padStart(2, '0')}`
          : 'completo'
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Exportar CSV',
        defaultPath: `financeiro-${suffix}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (canceled || !filePath) return { success: false, canceled: true }
      writeFileSync(filePath, '\uFEFF' + csv, 'utf8')
      return { success: true, path: filePath }
    } catch (error) {
      console.error('Erro ao exportar CSV:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('get-history', () => {
    try {
      return dbOperations.getHistory()
    } catch (error) {
      console.error('Erro ao buscar histórico:', error)
      return []
    }
  })

  ipcMain.handle('get-history-for-day', (_event, dateStr: string) => {
    try {
      return dbOperations.getHistoryForDay(dateStr)
    } catch (error) {
      console.error('Erro ao buscar histórico do dia:', error)
      return []
    }
  })

  ipcMain.handle('get-history-last24h', () => {
    try {
      return dbOperations.getHistoryLast24h()
    } catch (error) {
      console.error('Erro ao buscar histórico últimas 24h:', error)
      return []
    }
  })

  ipcMain.handle('get-daily-report', (_event, dateStr: string) => {
    try {
      return dbOperations.getDailyReport(dateStr)
    } catch (error) {
      console.error('Erro ao buscar relatório do dia:', error)
      return { totalAvulsos: 0, planosVendidosCount: 0, planosVendidosValue: 0, saved: null }
    }
  })

  ipcMain.handle(
    'save-daily-report',
    (
      _event,
      data: {
        dateStr: string
        totalAvulsos: number
        planosVendidosCount: number
        planosVendidosValue: number
        qtyCars: number
        qtyMotos: number
      }
    ) => {
      try {
        dbOperations.saveDailyReport(data.dateStr, {
          totalAvulsos: data.totalAvulsos,
          planosVendidosCount: data.planosVendidosCount,
          planosVendidosValue: data.planosVendidosValue,
          qtyCars: data.qtyCars,
          qtyMotos: data.qtyMotos
        })
        return { success: true }
      } catch (error) {
        console.error('Erro ao salvar relatório do dia:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  const EXCLUDE_TICKET_PASSWORD = '161021'
  const DELETE_CLIENT_PASSWORD = '161021'
  const EXCLUDE_ALL_PASSWORD = 'murilo123@'

  ipcMain.handle(
    'delete-client',
    (_event, data: { clientId: number; password: string }): { success: boolean; error?: string } => {
      try {
        if (data.password !== DELETE_CLIENT_PASSWORD) {
          return { success: false, error: 'Senha incorreta.' }
        }
        const gate = dbOperations.clientHasActiveParkingTicket(data.clientId)
        if (gate.blocked) {
          return {
            success: false,
            error: `Não é possível excluir: existe veículo no pátio com ticket ativo (placa ${gate.plate ?? ''}). Dê saída ou exclua o ticket antes.`
          }
        }
        dbOperations.deleteClientRecord(data.clientId)
        return { success: true }
      } catch (error) {
        console.error('Erro ao excluir cliente:', error)
        return { success: false, error: String(error) }
      }
    }
  )
  ipcMain.handle(
    'exclude-ticket',
    (_event, data: { id: number; password: string }): { success: boolean; error?: string } => {
      try {
        if (data.password !== EXCLUDE_TICKET_PASSWORD) {
          return { success: false, error: 'Senha incorreta.' }
        }
        dbOperations.excludeTicket(data.id)
        return { success: true }
      } catch (error) {
        console.error('Erro ao excluir ticket:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  ipcMain.handle(
    'exclude-all-active-tickets',
    (_event, data: { password: string }): { success: boolean; error?: string } => {
      try {
        if (data.password !== EXCLUDE_ALL_PASSWORD) {
          return { success: false, error: 'Senha incorreta.' }
        }
        dbOperations.excludeAllActiveTickets()
        return { success: true }
      } catch (error) {
        console.error('Erro ao excluir todos os tickets:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  ipcMain.handle('get-excluded-tickets', () => {
    try {
      return dbOperations.getExcludedTickets()
    } catch (error) {
      console.error('Erro ao buscar veículos excluídos:', error)
      return []
    }
  })

  ipcMain.handle('get-printers', async () => {
    try {
      const w = mainWindow ?? BrowserWindow.getAllWindows()[0]
      if (!w?.webContents) return []
      const wc = w.webContents as any
      if (typeof wc.getPrintersAsync === 'function') {
        return await wc.getPrintersAsync()
      }
      return wc.getPrinters?.() ?? []
    } catch (error) {
      console.error('Erro ao listar impressoras:', error)
      return []
    }
  })

  ipcMain.handle('get-printer-config', () => {
    return getConfig().printerName ?? ''
  })

  ipcMain.handle('save-printer-config', (_event, printerName: string) => {
    saveConfig({ printerName: printerName || undefined })
    return { success: true }
  })

  ipcMain.handle(
    'print-entry',
    async (
      _event,
      data: { id?: number; placa: string; entrada: string }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await printEntryTicket(data.placa, data.entrada, data.id)
        return { success: true }
      } catch (error) {
        console.error('Erro ao imprimir ticket de entrada:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  ipcMain.handle(
    'print-exit',
    async (
      _event,
      data: {
        placa: string
        entrada: string
        saida: string
        valor: number
        tempoTotal: string
      }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await printExitTicket(data.placa, data.entrada, data.saida, data.valor, data.tempoTotal)
        return { success: true }
      } catch (error) {
        console.error('Erro ao imprimir ticket de saída:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  ipcMain.handle(
    'print-subscription',
    async (
      _event,
      data: {
        clientData: { name: string; cpf: string; phone: string }
        vehicleList: string[]
        planData: { planName: string; value: number; expiryDate: string }
      }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await printSubscriptionReceipt(data)
        return { success: true }
      } catch (error) {
        console.error('Erro ao imprimir recibo mensalista:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  ipcMain.handle(
    'export-daily-report-pdf',
    async (
      _event,
      data: {
        dateStr: string
        totalAvulsos: number
        planosVendidosCount: number
        planosVendidosValue: number
        qtyCars: number
        qtyMotos: number
        savedAt?: string
      }
    ): Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }> => {
      try {
        const [y, m, d] = data.dateStr.split('-')
        const dateLabel = `${d}/${m}/${y}`
        const fmt = (v: number) => v.toFixed(2).replace('.', ',')
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    .sub { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: 600; }
    .total { font-weight: 700; font-size: 14px; }
  </style>
</head>
<body>
  <h1>KF ESTACIONAMENTO – Relatório do dia</h1>
  <p class="sub">Data: ${dateLabel}</p>
  <table>
    <tr><th>Item</th><th>Valor</th></tr>
    <tr><td>Faturamento avulsos (R$)</td><td>${fmt(data.totalAvulsos)}</td></tr>
    <tr><td>Planos vendidos (quantidade)</td><td>${data.planosVendidosCount}</td></tr>
    <tr><td>Valor planos vendidos (R$)</td><td>${fmt(data.planosVendidosValue)}</td></tr>
    <tr><td>Carros no pátio (salvo)</td><td>${data.qtyCars}</td></tr>
    <tr><td>Motos no pátio (salvo)</td><td>${data.qtyMotos}</td></tr>
    <tr class="total"><td>Total recebido no dia (R$)</td><td>${fmt(data.totalAvulsos + data.planosVendidosValue)}</td></tr>
  </table>
  ${data.savedAt ? `<p class="sub" style="margin-top: 20px;">Relatório salvo em ${data.savedAt}</p>` : ''}
</body>
</html>`
        const win = new BrowserWindow({
          width: 800,
          height: 600,
          show: false,
          webPreferences: { nodeIntegration: false }
        })
        win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
        await new Promise<void>((resolve, reject) => {
          win.webContents.once('did-finish-load', () => resolve())
          win.webContents.once('did-fail-load', (_, code) => reject(new Error('did-fail-load ' + code)))
        })
        const pdfBuffer = await win.webContents.printToPDF({
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: 'A4'
        })
        win.close()
        const defaultName = `Relatorio-${d}-${m}-${y}.pdf`
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow ?? BrowserWindow.getAllWindows()[0] ?? undefined, {
          defaultPath: defaultName,
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (canceled || !filePath) {
          return { success: false, canceled: true }
        }
        writeFileSync(filePath, pdfBuffer)
        return { success: true, path: filePath }
      } catch (error) {
        console.error('Erro ao exportar PDF do relatório:', error)
        return { success: false, error: String(error) }
      }
    }
  )

  ipcMain.handle('get-family-group', (_event, plate: string) => {
    try {
      return { success: true, data: dbOperations.getFamilyGroup(plate) }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('list-family-groups', () => {
    try {
      return { success: true, data: dbOperations.listFamilyGroups() }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('create-family-group', (_event, plate: string) => {
    try {
      const result = dbOperations.createFamilyGroup(plate)
      return { success: true, id: result.id }
    } catch (error) {
      const msg = String(error)
      if (msg.includes('UNIQUE') && msg.includes('family_groups.plate')) {
        return { success: false, error: 'Já existe um grupo familiar com essa placa.' }
      }
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('add-family-member', (_event, { groupId, name, cpf }: { groupId: number; name: string; cpf: string }) => {
    try {
      const cpfDigits = (cpf ?? '').replace(/\D/g, '')
      if (cpfDigits.length !== 11) {
        return { success: false, error: 'CPF inválido (deve ter 11 dígitos).' }
      }
      const result = dbOperations.addFamilyMember(groupId, name, cpf)
      return { success: true, id: result.id }
    } catch (error) {
      const msg = String(error)
      if (msg.includes('UNIQUE') || msg.includes('idx_family_members_cpf')) {
        return { success: false, error: 'Esse CPF já está cadastrado em um grupo familiar.' }
      }
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('update-family-member', (_event, { memberId, name, cpf }: { memberId: number; name: string; cpf: string }) => {
    try {
      const cpfDigits = (cpf ?? '').replace(/\D/g, '')
      if (cpfDigits.length !== 11) {
        return { success: false, error: 'CPF inválido (deve ter 11 dígitos).' }
      }
      dbOperations.updateFamilyMember(memberId, name, cpf)
      return { success: true }
    } catch (error) {
      const msg = String(error)
      if (msg.includes('UNIQUE') || msg.includes('idx_family_members_cpf')) {
        return { success: false, error: 'Esse CPF já está cadastrado em um grupo familiar.' }
      }
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('delete-family-member', (_event, memberId: number) => {
    try {
      const block = dbOperations.memberHasActiveTicket(memberId)
      if (block.blocked) {
        return { success: false, error: 'Este membro possui veículo no pátio. Finalize a saída antes de remover.' }
      }
      dbOperations.deleteFamilyMember(memberId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('delete-family-group', (_event, groupId: number) => {
    try {
      dbOperations.deleteFamilyGroup(groupId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // ── Sync LAN ──────────────────────────────────────────────────────────
  ipcMain.handle('sync-start-server', () => {
    try {
      const info = startSyncServer()
      return { success: true, ...info }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('sync-stop-server', () => {
    try {
      stopSyncServer()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('sync-server-info', () => {
    return getSyncServerInfo()
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  stopSyncServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
