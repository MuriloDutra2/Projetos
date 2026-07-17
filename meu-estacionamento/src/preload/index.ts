import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getTickets: () => ipcRenderer.invoke('get-tickets'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  getHistoryForDay: (dateStr: string) => ipcRenderer.invoke('get-history-for-day', dateStr),
  getHistoryLast24h: () => ipcRenderer.invoke('get-history-last24h'),
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
  excludeAllActiveTickets: (data: { password: string }) =>
    ipcRenderer.invoke('exclude-all-active-tickets', data),
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
  createTicket: (data: { placa: string; tipo: string; cpf?: string }) =>
    ipcRenderer.invoke('create-ticket', data),
  checkoutTicket: (data: { id: number; paymentMethod?: string }) =>
    ipcRenderer.invoke('checkout-ticket', data),
  calculateValue: (data: {
    entrada: string
    placa?: string
    tipo?: string
    cpf?: string
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
    garage_billing_day?: number | null
    garage_billing_month?: number | null
  }) => ipcRenderer.invoke('create-client', data),
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
  }) => ipcRenderer.invoke('update-client', data),
  renewSubscription: (data: {
    clientId: number
    planType: string
    amount: number
    months?: number
    paymentMethod?: string
    notes?: string
  }) => ipcRenderer.invoke('renew-subscription', data),
  getFinancialHistory: () => ipcRenderer.invoke('get-financial-history'),
  getFinancialSummaryByMethod: (data: { month: number; year: number }) =>
    ipcRenderer.invoke('get-financial-summary-by-method', data),
  getFinanceMonthData: (data: { month: number; year: number }) =>
    ipcRenderer.invoke('get-finance-month-data', data),
  getClientStatement: (clientId: number) => ipcRenderer.invoke('get-client-statement', clientId),
  exportFinancialCsv: (data?: { month?: number; year?: number }) =>
    ipcRenderer.invoke('export-financial-csv', data),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getPrinterConfig: () => ipcRenderer.invoke('get-printer-config'),
  savePrinterConfig: (printerName: string) =>
    ipcRenderer.invoke('save-printer-config', printerName),
  toggleClientStatus: (data: { clientId: number; active: number }) =>
    ipcRenderer.invoke('toggle-client-status', data),
  deleteClient: (data: { clientId: number; password: string }) =>
    ipcRenderer.invoke('delete-client', data),
  printSubscription: (data: {
    clientData: { name: string; cpf: string; phone: string }
    vehicleList: string[]
    planData: { planName: string; value: number; expiryDate: string }
  }) => ipcRenderer.invoke('print-subscription', data),
  printEntry: (data: { id: number; placa: string; entrada: string }) =>
    ipcRenderer.invoke('print-entry', data),
  printExit: (data: { placa: string; entrada: string; saida: string; valor: number; tempoTotal: string }) =>
    ipcRenderer.invoke('print-exit', data),
  getFamilyGroup: (plate: string) => ipcRenderer.invoke('get-family-group', plate),
  listFamilyGroups: () => ipcRenderer.invoke('list-family-groups'),
  createFamilyGroup: (plate: string) => ipcRenderer.invoke('create-family-group', plate),
  addFamilyMember: (groupId: number, name: string, cpf: string) =>
    ipcRenderer.invoke('add-family-member', { groupId, name, cpf }),
  updateFamilyMember: (memberId: number, name: string, cpf: string) =>
    ipcRenderer.invoke('update-family-member', { memberId, name, cpf }),
  deleteFamilyMember: (memberId: number) => ipcRenderer.invoke('delete-family-member', memberId),
  deleteFamilyGroup: (groupId: number) => ipcRenderer.invoke('delete-family-group', groupId),

  // ── Fechamento de caixa por turno ──
  getShiftOverview: () => ipcRenderer.invoke('get-shift-overview'),
  closeShift: (data: { cashCounted?: number | null; operatorName?: string }) =>
    ipcRenderer.invoke('close-shift', data),
  confirmShiftClosure: (data: { id: number; operatorName: string; cashCounted?: number | null }) =>
    ipcRenderer.invoke('confirm-shift-closure', data),
  printShiftClosure: (data: unknown) => ipcRenderer.invoke('print-shift-closure', data),

  // ── Sync LAN ──
  syncStartServer: () => ipcRenderer.invoke('sync-start-server'),
  syncStopServer: () => ipcRenderer.invoke('sync-stop-server'),
  syncServerInfo: () => ipcRenderer.invoke('sync-server-info')
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
