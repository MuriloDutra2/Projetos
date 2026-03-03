import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { writeFileSync, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { dbOperations, translateDbError } from './db'
import { calcularValor, minutosDaEstadia } from './calculations'
import { printEntryTicket, printExitTicket, printSubscriptionReceipt } from './printer'
import { getConfig, saveConfig } from './config'


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

  ipcMain.handle('create-ticket', (_event, { placa, tipo }: { placa: string; tipo: string }) => {
    try {
      const placaNorm = normalizePlate(placa)
      if (!placaNorm) return { success: false, error: 'Placa inválida' }
      if (dbOperations.hasActiveTicket(placaNorm)) {
        return { success: false, message: 'Veículo já está no pátio!' }
      }
      const entrada = new Date().toISOString()
      const id = dbOperations.createTicket(placaNorm, tipo, entrada)
      return { success: true, id, entrada }
    } catch (error) {
      console.error('Erro ao criar ticket:', error)
      return { success: false, error: String(error) }
    }
  })

  function getFreeMinutesForTicket(placa: string, tipo: string): number {
    if (tipo === 'MENSALISTA') {
      const sub = dbOperations.getVehicleSubscription(normalizePlate(placa))
      return sub ? sub.freeMinutes : 90
    }
    return 90
  }

  function isAvulsoParaPernoite(tipo: string): boolean {
    return tipo === 'Carro' || tipo === 'Moto'
  }

  function usaControleDiario(tipo: string): boolean {
    return tipo === 'Carro' || tipo === 'Moto' || tipo === 'MENSALISTA'
  }

  ipcMain.handle(
    'checkout-ticket',
    (_event, { id }: { id: number }) => {
      try {
        const tickets = dbOperations.getAllActiveTickets()
        const ticket = tickets.find((t: any) => t.id === id)

        if (!ticket) {
          return { success: false, error: 'Ticket não encontrado' }
        }

        const saida = new Date().toISOString()
        const saidaDate = new Date(saida)
        const dataStr = saidaDate.toISOString().slice(0, 10)

        const freeMinutes = getFreeMinutesForTicket(ticket.placa, ticket.tipo)
        const dailyUsed = dbOperations.getDailyUsedMinutes(ticket.placa, dataStr)
        const aplicarPernoite = isAvulsoParaPernoite(ticket.tipo)
        const valor = calcularValor(
          ticket.entrada,
          freeMinutes,
          saida,
          dailyUsed,
          aplicarPernoite
        )

        dbOperations.checkoutTicket(id, valor, saida)

        if (usaControleDiario(ticket.tipo) && freeMinutes < 999999) {
          const minutos = minutosDaEstadia(ticket.entrada, saida)
          dbOperations.addDailyUsedMinutes(ticket.placa, dataStr, minutos)
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
      data: { entrada: string; placa?: string; tipo?: string }
    ) => {
      try {
        const tipo = data.tipo ?? 'Carro'
        const placa = data.placa ?? ''
        const freeMinutes =
          tipo === 'MENSALISTA' && placa
            ? (dbOperations.getVehicleSubscription(normalizePlate(placa))?.freeMinutes ?? 90)
            : 90
        const agora = new Date().toISOString()
        const dataStr = new Date().toISOString().slice(0, 10)
        const dailyUsed = placa ? dbOperations.getDailyUsedMinutes(placa, dataStr) : 0
        const aplicarPernoite = tipo === 'Carro' || tipo === 'Moto'
        const valor = calcularValor(
          data.entrada,
          freeMinutes,
          agora,
          dailyUsed,
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
      const today = new Date().toISOString().slice(0, 10)
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
          clientName: '',
          planType: '',
          isExpired: false,
          expiryDate: '',
          freeMinutes: 90
        }
      }
      return {
        isSubscriber: true,
        clientName: sub.clientName,
        planType: sub.planType,
        isExpired: sub.isExpired,
        expiryDate: sub.expiryDate,
        freeMinutes: sub.freeMinutes
      }
    } catch (error) {
      console.error('Erro ao verificar placa:', error)
      return {
        isSubscriber: false,
        clientName: '',
        planType: '',
        isExpired: false,
        expiryDate: '',
        freeMinutes: 90
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
      return []
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
      data: { clientId: number; planType: string; amount: number }
    ) => {
      try {
        const newExpiry = dbOperations.renewSubscription(
          data.clientId,
          data.planType,
          data.amount
        )
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

  ipcMain.handle('export-financial-csv', async () => {
    try {
      const tickets = dbOperations.getAllFinishedTicketsForFinance() as any[]
      const payments = dbOperations.getFinancialHistory() as any[]
      const rows: { date: string; type: string; description: string; value: number }[] = []
      tickets.forEach((t) => {
        rows.push({
          date: t.saida ?? t.entrada,
          type: 'Avulso',
          description: `Ticket ${t.placa}`,
          value: t.valor ?? 0
        })
      })
      payments.forEach((p) => {
        rows.push({
          date: p.payment_date,
          type: 'Renovação',
          description: p.client_name ?? '',
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
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Exportar CSV',
        defaultPath: `financeiro-${new Date().toISOString().slice(0, 10)}.csv`,
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

  const EXCLUDE_TICKET_PASSWORD = '2312'
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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
