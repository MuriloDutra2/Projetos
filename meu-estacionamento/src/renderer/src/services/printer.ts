export async function printEntry(data: {
  id: number
  placa: string
  entrada: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.printEntry(data)
}

export async function printExit(data: {
  placa: string
  entrada: string
  saida: string
  valor: number
  tempoTotal: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.printExit(data)
}

export async function printSubscription(data: {
  clientData: { name: string; cpf: string; phone: string }
  vehicleList: string[]
  planData: { planName: string; value: number; expiryDate: string }
}): Promise<{ success: boolean; error?: string }> {
  return window.api.printSubscription(data)
}

export async function getPrinters(): Promise<{ name: string; displayName: string }[]> {
  return window.api.getPrinters()
}

export async function getPrinterConfig(): Promise<string> {
  return window.api.getPrinterConfig()
}

export async function savePrinterConfig(printerName: string): Promise<{ success: boolean }> {
  return window.api.savePrinterConfig(printerName)
}
