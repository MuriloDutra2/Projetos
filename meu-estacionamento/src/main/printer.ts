import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { PosPrinter } from 'electron-pos-printer'
import { format } from 'date-fns'
import { getConfig } from './config'

type MaybeDate = string | Date

/** Caminho da logo Kefit para impressão (resources/logo.png). Retorna null se o arquivo não existir. */
function getLogoPath(): string | null {
  const candidates: string[] = [
    join(process.cwd(), 'resources', 'logo.png'),
    join(app.getAppPath(), '..', 'resources', 'logo.png'),
    join(app.getAppPath(), '..', 'app.asar.unpacked', 'resources', 'logo.png')
  ]
  if (app.isPackaged && process.resourcesPath) {
    candidates.unshift(join(process.resourcesPath, 'resources', 'logo.png'))
    candidates.unshift(join(process.resourcesPath, 'logo.png'))
  }
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

/** Itens de cabeçalho (logo + título KF ESTACIONAMENTO) para os recibos. */
function getHeaderItems(titleText: string): any[] {
  const logoPath = getLogoPath()
  const items: any[] = []
  if (logoPath) {
    items.push({
      type: 'image',
      path: logoPath,
      position: 'center' as const,
      width: '120px',
      height: '72px',
      style: { marginBottom: '4px', ...safeTextStyle }
    })
  }
  items.push(
    {
      type: 'text',
      value: titleText,
      style: {
        fontWeight: '700',
        textAlign: 'center',
        fontSize: '18px',
        ...safeTextStyle
      }
    },
    {
      type: 'text',
      value: '------------------------------',
      style: { textAlign: 'center', marginTop: '4px', ...safeTextStyle }
    }
  )
  return items
}

/** Ative true para ver o preview na tela em vez de imprimir (debug da tira em branco). */
const DEBUG_PRINT_PREVIEW = process.env.DEBUG_PRINT === '1' || false

/**
 * 80mm em pixels (~96 DPI): 80 / 25.4 * 96 ≈ 302.
 * A lib usa isso para o container HTML e, internamente, converte para mícrons no spooler.
 * NÃO usar pageSize string '80mm' — o Electron/Spooler não aceita; usar objeto em px.
 */
const WIDTH_80MM_PX = 302
/** Altura mínima da página em px (~120mm) para o spooler não interpretar página inválida e cortar. */
const MIN_PAGE_HEIGHT_PX = 1134

function toDate(value: MaybeDate): Date {
  return value instanceof Date ? value : new Date(value)
}

function getBaseOptions(): Record<string, unknown> {
  const { printerName } = getConfig()
  return {
    preview: DEBUG_PRINT_PREVIEW,
    silent: !DEBUG_PRINT_PREVIEW,
    printerName: printerName || undefined,
    width: `${WIDTH_80MM_PX}px`,
    margin: '0 0 0 0',
    timeOutPerLine: 500,
    /**
     * Objeto em PIXELS: a lib repassa ao Electron em mícrons.
     * Evita pageSize string '80mm' (inválido no Spooler) e garante altura mínima
     * para não gerar "página" de altura ~0 (corte instantâneo).
     */
    pageSize: {
      width: WIDTH_80MM_PX,
      height: MIN_PAGE_HEIGHT_PX
    },
    margins: { marginType: 'none' as const }
  }
}

const PRINT_TIMEOUT_MS = 30000

/**
 * Envolve a impressão com timeout e tratamento de erro para falhas do Spooler/timeout.
 */
async function runPrint(printFn: () => Promise<unknown>): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('[PrintTimeout] A impressora não respondeu em 30s. Verifique cabo USB e fila de impressão.'))
    }, PRINT_TIMEOUT_MS)
  })
  try {
    await Promise.race([printFn(), timeoutPromise])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('TimedOutError') || msg.includes('timeout')) {
      throw new Error('A impressora não respondeu. Verifique se está ligada e o cabo USB conectado.')
    }
    throw err
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

/** Estilos seguros para térmica 80mm: largura máxima, quebra de palavra, sem overflow. */
const safeTextStyle = {
  wordBreak: 'break-word' as const,
  maxWidth: `${WIDTH_80MM_PX}px`,
  boxSizing: 'border-box' as const
}

export async function printEntryTicket(
  placa: string,
  dataEntrada: MaybeDate,
  _id?: number
): Promise<void> {
  const entradaDate = toDate(dataEntrada)
  const entradaFormatada = format(entradaDate, 'dd/MM/yyyy HH:mm')

  const data: any[] = [
    ...getHeaderItems('KF ESTACIONAMENTO'),
    {
      type: 'text',
      value: 'TICKET DE ENTRADA',
      style: {
        textAlign: 'center',
        marginTop: '8px',
        fontSize: '14px',
        ...safeTextStyle
      }
    },
    {
      type: 'text',
      value: `Placa: ${placa}`,
      style: {
        marginTop: '12px',
        fontSize: '16px',
        fontWeight: '700',
        ...safeTextStyle
      }
    },
    {
      type: 'text',
      value: `Entrada: ${entradaFormatada}`,
      style: { marginTop: '4px', fontSize: '12px', ...safeTextStyle }
    },
    {
      type: 'barCode',
      value: placa.replace(/[^A-Z0-9]/g, '').toUpperCase(),
      height: 40,
      width: 2,
      displayValue: true,
      fontsize: 12
    },
    {
      type: 'text',
      value: 'Guarde este ticket.',
      style: {
        marginTop: '12px',
        textAlign: 'center',
        fontSize: '11px',
        ...safeTextStyle
      }
    }
  ].filter(Boolean)

  await runPrint(() => PosPrinter.print(data, getBaseOptions() as any))
}

export async function printExitTicket(
  placa: string,
  dataEntrada: MaybeDate,
  dataSaida: MaybeDate,
  valor: number,
  tempoTotal: string
): Promise<void> {
  const entradaFormatada = format(toDate(dataEntrada), 'dd/MM/yyyy HH:mm')
  const saidaFormatada = format(toDate(dataSaida), 'dd/MM/yyyy HH:mm')
  const valorFormatado = valor.toFixed(2).replace('.', ',')

  const data: any[] = [
    ...getHeaderItems('KF ESTACIONAMENTO'),
    {
      type: 'text',
      value: 'RECIBO DE PAGAMENTO',
      style: {
        textAlign: 'center',
        marginTop: '8px',
        fontSize: '14px',
        ...safeTextStyle
      }
    },
    {
      type: 'text',
      value: `Placa: ${placa}`,
      style: { marginTop: '12px', fontSize: '12px', ...safeTextStyle }
    },
    {
      type: 'text',
      value: `Entrada: ${entradaFormatada}`,
      style: { marginTop: '4px', fontSize: '11px', ...safeTextStyle }
    },
    {
      type: 'text',
      value: `Saída: ${saidaFormatada}`,
      style: { marginTop: '2px', fontSize: '11px', ...safeTextStyle }
    },
    {
      type: 'text',
      value: `Permanência: ${tempoTotal}`,
      style: { marginTop: '8px', fontSize: '12px', ...safeTextStyle }
    },
    {
      type: 'text',
      value: `Valor Total: R$ ${valorFormatado}`,
      style: {
        marginTop: '8px',
        fontSize: '14px',
        fontWeight: '700',
        ...safeTextStyle
      }
    },
    {
      type: 'text',
      value: 'Obrigado pela preferencia!',
      style: {
        marginTop: '16px',
        textAlign: 'center',
        fontSize: '11px',
        ...safeTextStyle
      }
    }
  ]

  await runPrint(() => PosPrinter.print(data, getBaseOptions() as any))
}

export interface SubscriptionReceiptData {
  clientData: { name: string; cpf: string; phone: string }
  vehicleList: string[]
  planData: { planName: string; value: number; expiryDate: string }
}

function buildSubscriptionReceiptContent(
  data: SubscriptionReceiptData,
  via: 'ESTABELECIMENTO' | 'CLIENTE'
): any[] {
  const { clientData, vehicleList, planData } = data
  const expiryFormatted = format(new Date(planData.expiryDate), 'dd/MM/yyyy')
  const valueFormatted = planData.value.toFixed(2).replace('.', ',')
  const vehiclesText = vehicleList.length ? vehicleList.join(', ') : '-'

  return [
    ...getHeaderItems(`KF ESTACIONAMENTO - VIA ${via}`),
    {
      type: 'text',
      value: 'CONTRATO/RECIBO MENSALISTA',
      style: {
        textAlign: 'center',
        marginTop: '8px',
        fontSize: '12px',
        fontWeight: '700',
        ...safeTextStyle
      }
    },
    {
      type: 'text',
      value: `Nome: ${clientData.name}`,
      style: { marginTop: '10px', fontSize: '11px', ...safeTextStyle }
    },
    {
      type: 'text',
      value: `CPF: ${clientData.cpf || '-'}`,
      style: { marginTop: '2px', fontSize: '11px', ...safeTextStyle }
    },
    {
      type: 'text',
      value: `Celular: ${clientData.phone || '-'}`,
      style: { marginTop: '2px', fontSize: '11px', ...safeTextStyle }
    },
    {
      type: 'text',
      value: `Plano: ${planData.planName} - R$ ${valueFormatted} - Validade: ${expiryFormatted}`,
      style: { marginTop: '8px', fontSize: '11px', ...safeTextStyle }
    },
    {
      type: 'text',
      value: `Veículos: ${vehiclesText}`,
      style: { marginTop: '4px', fontSize: '11px', ...safeTextStyle }
    },
    {
      type: 'text',
      value: 'Declaro estar ciente das regras e horários do estacionamento.',
      style: { marginTop: '12px', fontSize: '10px', textAlign: 'center', ...safeTextStyle }
    },
    {
      type: 'text',
      value: '_________________________________',
      style: { marginTop: '16px', textAlign: 'center', fontSize: '10px', ...safeTextStyle }
    },
    {
      type: 'text',
      value: 'Assinatura',
      style: { marginTop: '2px', textAlign: 'center', fontSize: '10px', ...safeTextStyle }
    },
    {
      type: 'text',
      value: '\n',
      style: { marginTop: '8px' }
    }
  ]
}

/**
 * Imprime contrato/recibo mensalista em 2 vias (ESTABELECIMENTO e CLIENTE).
 */
export async function printSubscriptionReceipt(
  data: SubscriptionReceiptData
): Promise<void> {
  const via1 = buildSubscriptionReceiptContent(data, 'ESTABELECIMENTO')
  const via2 = buildSubscriptionReceiptContent(data, 'CLIENTE')
  const separator = [
    {
      type: 'text' as const,
      value: '======== CORTE AQUI ========',
      style: { textAlign: 'center' as const, marginTop: '12px', fontSize: '10px' }
    }
  ]
  const fullContent = [...via1, ...separator, ...via2]
  await runPrint(() => PosPrinter.print(fullContent, getBaseOptions() as any))
}

