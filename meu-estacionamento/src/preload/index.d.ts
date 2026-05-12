import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getTickets: () => Promise<any[]>
      getHistory: () => Promise<any[]>
      getHistoryForDay: (dateStr: string) => Promise<any[]>
      getHistoryLast24h: () => Promise<any[]>
      getDailyReport: (dateStr: string) => Promise<{
        totalAvulsos: number
        planosVendidosCount: number
        planosVendidosValue: number
        saved: { qtyCars: number; qtyMotos: number; createdAt: string } | null
      }>
      saveDailyReport: (data: {
        dateStr: string
        totalAvulsos: number
        planosVendidosCount: number
        planosVendidosValue: number
        qtyCars: number
        qtyMotos: number
      }) => Promise<{ success: boolean; error?: string }>
      excludeTicket: (data: { id: number; password: string }) => Promise<{ success: boolean; error?: string }>
      excludeAllActiveTickets: (data: { password: string }) => Promise<{ success: boolean; error?: string }>
      getExcludedTickets: () => Promise<{ id: number; placa: string; tipo: string; entrada: string; saida: string }[]>
      exportDailyReportPdf: (data: {
        dateStr: string
        totalAvulsos: number
        planosVendidosCount: number
        planosVendidosValue: number
        qtyCars: number
        qtyMotos: number
        savedAt?: string
      }) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
      createTicket: (data: { placa: string; tipo: string; cpf?: string }) => Promise<{ success: boolean; id?: number; entrada?: string; billedAsAvulso?: boolean; error?: string; message?: string }>
      checkoutTicket: (data: { id: number }) => Promise<{ success: boolean; valor?: number; error?: string }>
      calculateValue: (data: { entrada: string; placa?: string; tipo?: string }) => Promise<{ valor: number }>
      checkPlateSubscription: (placa: string) => Promise<{
        isSubscriber: boolean
        clientId?: number
        clientName: string
        planType: string
        isExpired: boolean
        expiryDate: string
        freeMinutes: number
        isDebtor: boolean
      }>
      checkPlateWasInToday: (placa: string) => Promise<boolean>
      getClients: () => Promise<any[]>
      createClient: (data: {
        name: string
        cpf: string
        phone: string
        plan_type: string
        expiry_date: string
        plates: string[]
        garage_billing_day?: number | null
        garage_billing_month?: number | null
      }) => Promise<{ success: boolean; id?: number; error?: string }>
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
      }) => Promise<{ success: boolean; error?: string }>
      renewSubscription: (data: { clientId: number; planType: string; amount: number; months?: number; paymentMethod?: string; notes?: string }) => Promise<{ success: boolean; newExpiry?: string; error?: string }>
      getFinancialHistory: () => Promise<any[]>
      getFinancialSummaryByMethod: (data: { month: number; year: number }) => Promise<{ payment_method: string; total: number }[]>
      getClientStatement: (clientId: number) => Promise<{
        client: { id: number; name: string; cpf?: string; phone?: string; plan_type: string; expiry_date: string; active: number }
        payments: {
          id: number
          amount: number
          plan_type: string
          payment_date: string
          new_expiry_date: string
          payment_method: string
          competency_month?: string | null
          is_advance: number
          notes?: string | null
        }[]
        avulsoWhileDebtor: { id: number; placa: string; tipo: string; entrada: string; saida: string | null; valor: number }[]
        totals: { payments: number; avulsos: number }
      } | null>
      exportFinancialCsv: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
      getPrinters: () => Promise<{ name: string; displayName: string }[]>
      getPrinterConfig: () => Promise<string>
      savePrinterConfig: (printerName: string) => Promise<{ success: boolean }>
      toggleClientStatus: (data: { clientId: number; active: number }) => Promise<{ success: boolean; error?: string }>
      deleteClient: (data: { clientId: number; password: string }) => Promise<{ success: boolean; error?: string }>
      printSubscription: (data: {
        clientData: { name: string; cpf: string; phone: string }
        vehicleList: string[]
        planData: { planName: string; value: number; expiryDate: string }
      }) => Promise<{ success: boolean; error?: string }>
      printEntry: (data: { id: number; placa: string; entrada: string }) => Promise<{ success: boolean; error?: string }>
      printExit: (data: { placa: string; entrada: string; saida: string; valor: number; tempoTotal: string }) => Promise<{ success: boolean; error?: string }>
      getFamilyGroup: (plate: string) => Promise<{ success: boolean; data: FamilyGroup | null }>
      listFamilyGroups: () => Promise<{ success: boolean; data: FamilyGroup[] }>
      createFamilyGroup: (plate: string) => Promise<{ success: boolean; id?: number; error?: string }>
      addFamilyMember: (groupId: number, name: string, cpf: string) => Promise<{ success: boolean; id?: number; error?: string }>
      updateFamilyMember: (memberId: number, name: string, cpf: string) => Promise<{ success: boolean; error?: string }>
      deleteFamilyMember: (memberId: number) => Promise<{ success: boolean; error?: string }>
      deleteFamilyGroup: (groupId: number) => Promise<{ success: boolean; error?: string }>
    }
  }
  interface FamilyMember {
    id: number
    name: string
    cpf: string
  }
  interface FamilyGroup {
    id: number
    plate: string
    created_at: string
    members: FamilyMember[]
  }
}
