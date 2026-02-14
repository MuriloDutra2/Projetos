import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync, existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { dbOperations, translateDbError } from './db'
import { calcularValor } from './calculations'
import { printEntryTicket, printExitTicket, printSubscriptionReceipt } from './printer'
import { getConfig, saveConfig } from './config'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const winIcon =
    process.platform === 'win32'
      ? (() => {
          const icoPath = join(is.dev ? process.cwd() : app.getAppPath(), 'build', 'icon.ico')
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
      preload: join(__dirname, '../preload/index.js'),
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
    win.loadFile(join(__dirname, '../renderer/index.html'))
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

  ipcMain.handle(
    'checkout-ticket',
    (_event, { id }: { id: number }) => {
      try {
        const tickets = dbOperations.getAllActiveTickets()
        const ticket = tickets.find((t: any) => t.id === id)

        if (!ticket) {
          return { success: false, error: 'Ticket não encontrado' }
        }

        const freeMinutes = getFreeMinutesForTicket(ticket.placa, ticket.tipo)
        const valor = calcularValor(ticket.entrada, freeMinutes)
        const saida = new Date().toISOString()

        dbOperations.checkoutTicket(id, valor, saida)
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
        const freeMinutes =
          data.tipo === 'MENSALISTA' && data.placa
            ? (dbOperations.getVehicleSubscription(normalizePlate(data.placa))?.freeMinutes ?? 90)
            : 90
        const valor = calcularValor(data.entrada, freeMinutes)
        return { valor }
      } catch (error) {
        console.error('Erro ao calcular valor:', error)
        return { valor: 0 }
      }
    }
  )

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
