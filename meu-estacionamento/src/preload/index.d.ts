import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getTickets: () => Promise<any[]>
      getHistory: () => Promise<any[]>
      createTicket: (data: { placa: string; tipo: string }) => Promise<{ success: boolean; id?: number; entrada?: string; error?: string; message?: string }>
      checkoutTicket: (data: { id: number }) => Promise<{ success: boolean; valor?: number; error?: string }>
      calculateValue: (data: { entrada: string; placa?: string; tipo?: string }) => Promise<{ valor: number }>
      checkPlateSubscription: (placa: string) => Promise<{
        isSubscriber: boolean
        clientName: string
        planType: string
        isExpired: boolean
        expiryDate: string
        freeMinutes: number
      }>
      getClients: () => Promise<any[]>
      createClient: (data: { name: string; cpf: string; phone: string; plan_type: string; expiry_date: string; plates: string[] }) => Promise<{ success: boolean; id?: number; error?: string }>
      updateClient: (data: { id: number; name: string; cpf: string; phone: string; plan_type: string; expiry_date: string; plates: string[] }) => Promise<{ success: boolean; error?: string }>
      renewSubscription: (data: { clientId: number; planType: string; amount: number }) => Promise<{ success: boolean; newExpiry?: string; error?: string }>
      getFinancialHistory: () => Promise<any[]>
      exportFinancialCsv: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
      getPrinters: () => Promise<{ name: string; displayName: string }[]>
      getPrinterConfig: () => Promise<string>
      savePrinterConfig: (printerName: string) => Promise<{ success: boolean }>
      toggleClientStatus: (data: { clientId: number; active: number }) => Promise<{ success: boolean; error?: string }>
      printSubscription: (data: {
        clientData: { name: string; cpf: string; phone: string }
        vehicleList: string[]
        planData: { planName: string; value: number; expiryDate: string }
      }) => Promise<{ success: boolean; error?: string }>
    }
  }
}
