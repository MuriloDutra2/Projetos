import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getTickets: () => ipcRenderer.invoke('get-tickets'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  getHistoryForDay: (dateStr: string) => ipcRenderer.invoke('get-history-for-day', dateStr),
  getDailyReport: (dateStr: string) => ipcRenderer.invoke('get-daily-report', dateStr),
  saveDailyReport: (data: {
    dateStr: string
    totalAvulsos: number
    planosVendidosCount: number
    planosVendidosValue: number
    qtyCars: number
    qtyMotos: number
  }) => ipcRenderer.invoke('save-daily-report', data),
  excludeTicket: (data: { id: number; password: string }) =>
    ipcRenderer.invoke('exclude-ticket', data),
  getExcludedTickets: () => ipcRenderer.invoke('get-excluded-tickets'),
  exportDailyReportPdf: (data: {
    dateStr: string
    totalAvulsos: number
    planosVendidosCount: number
    planosVendidosValue: number
    qtyCars: number
    qtyMotos: number
    savedAt?: string
  }) => ipcRenderer.invoke('export-daily-report-pdf', data),
  createTicket: (data: { placa: string; tipo: string }) =>
    ipcRenderer.invoke('create-ticket', data),
  checkoutTicket: (data: { id: number }) => ipcRenderer.invoke('checkout-ticket', data),
  calculateValue: (data: {
    entrada: string
    placa?: string
    tipo?: string
  }) => ipcRenderer.invoke('calculate-value', data),
  checkPlateSubscription: (placa: string) =>
    ipcRenderer.invoke('check-plate-subscription', placa),
  checkPlateWasInToday: (placa: string) =>
    ipcRenderer.invoke('check-plate-was-in-today', placa),
  getClients: () => ipcRenderer.invoke('get-clients'),
  createClient: (data: {
    name: string
    cpf: string
    phone: string
    plan_type: string
    expiry_date: string
    plates: string[]
  }) => ipcRenderer.invoke('create-client', data),
  updateClient: (data: {
    id: number
    name: string
    cpf: string
    phone: string
    plan_type: string
    expiry_date: string
    plates: string[]
  }) => ipcRenderer.invoke('update-client', data),
  renewSubscription: (data: {
    clientId: number
    planType: string
    amount: number
  }) => ipcRenderer.invoke('renew-subscription', data),
  getFinancialHistory: () => ipcRenderer.invoke('get-financial-history'),
  exportFinancialCsv: () => ipcRenderer.invoke('export-financial-csv'),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getPrinterConfig: () => ipcRenderer.invoke('get-printer-config'),
  savePrinterConfig: (printerName: string) =>
    ipcRenderer.invoke('save-printer-config', printerName),
  toggleClientStatus: (data: { clientId: number; active: number }) =>
    ipcRenderer.invoke('toggle-client-status', data),
  printSubscription: (data: {
    clientData: { name: string; cpf: string; phone: string }
    vehicleList: string[]
    planData: { planName: string; value: number; expiryDate: string }
  }) => ipcRenderer.invoke('print-subscription', data)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
