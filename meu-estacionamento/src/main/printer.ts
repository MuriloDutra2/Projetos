import { PosPrinter } from 'electron-pos-printer'
import { format } from 'date-fns'
import { getConfig } from './config'

type MaybeDate = string | Date

function toDate(value: MaybeDate): Date {
  return value instanceof Date ? value : new Date(value)
}

function getBaseOptions(): Record<string, unknown> {
  const { printerName } = getConfig()
  return {
    preview: false,
    width: '80mm',
    margin: '0 0 0 0',
    printerName: printerName || undefined,
    silent: true
  }
}

export async function printEntryTicket(
  placa: string,
  dataEntrada: MaybeDate,
  id?: number
): Promise<void> {
  const entradaDate = toDate(dataEntrada)
  const entradaFormatada = format(entradaDate, 'dd/MM/yyyy HH:mm')

  const data: any[] = [
    {
      type: 'text',
      value: 'KF ESTACIONAMENTO',
      style: {
        fontWeight: '700',
        textAlign: 'center',
        fontSize: '24px'
      }
    },
    {
      type: 'text',
      value: '------------------------------',
      style: {
        textAlign: 'center',
        marginTop: '4px'
      }
    },
    {
      type: 'text',
      value: 'TICKET DE ENTRADA',
      style: {
        textAlign: 'center',
        marginTop: '8px',
        fontSize: '16px'
      }
    },
    {
      type: 'text',
      value: `Placa: ${placa}`,
      style: {
        marginTop: '12px',
        fontSize: '18px',
        fontWeight: '700'
      }
    },
    {
      type: 'text',
      value: `Entrada: ${entradaFormatada}`,
      style: {
        marginTop: '4px',
        fontSize: '14px'
      }
    },
    id && {
      type: 'qrCode',
      value: String(id),
      height: 80,
      width: 80,
      style: {
        marginTop: '12px',
        marginBottom: '4px',
        textAlign: 'center'
      }
    },
    {
      type: 'text',
      value: 'Guarde este ticket.',
      style: {
        marginTop: '12px',
        textAlign: 'center',
        fontSize: '12px'
      }
    }
  ].filter(Boolean)

  await PosPrinter.print(data, getBaseOptions() as any)
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
    {
      type: 'text',
      value: 'KF ESTACIONAMENTO',
      style: {
        fontWeight: '700',
        textAlign: 'center',
        fontSize: '20px'
      }
    },
    {
      type: 'text',
      value: '------------------------------',
      style: {
        textAlign: 'center',
        marginTop: '4px'
      }
    },
    {
      type: 'text',
      value: 'RECIBO DE PAGAMENTO',
      style: {
        textAlign: 'center',
        marginTop: '8px',
        fontSize: '16px'
      }
    },
    {
      type: 'text',
      value: `Placa: ${placa}`,
      style: {
        marginTop: '12px',
        fontSize: '14px'
      }
    },
    {
      type: 'text',
      value: `Entrada: ${entradaFormatada}`,
      style: {
        marginTop: '4px',
        fontSize: '12px'
      }
    },
    {
      type: 'text',
      value: `Saída: ${saidaFormatada}`,
      style: {
        marginTop: '2px',
        fontSize: '12px'
      }
    },
    {
      type: 'text',
      value: `Permanência: ${tempoTotal}`,
      style: {
        marginTop: '8px',
        fontSize: '14px'
      }
    },
    {
      type: 'text',
      value: `Valor Total: R$ ${valorFormatado}`,
      style: {
        marginTop: '8px',
        fontSize: '16px',
        fontWeight: '700'
      }
    },
    {
      type: 'text',
      value: 'Obrigado pela preferencia!',
      style: {
        marginTop: '16px',
        textAlign: 'center',
        fontSize: '12px'
      }
    }
  ]

  await PosPrinter.print(data, getBaseOptions() as any)
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
    {
      type: 'text',
      value: `KF ESTACIONAMENTO - VIA ${via}`,
      style: {
        fontWeight: '700',
        textAlign: 'center',
        fontSize: '14px'
      }
    },
    {
      type: 'text',
      value: '------------------------------',
      style: { textAlign: 'center', marginTop: '4px' }
    },
    {
      type: 'text',
      value: 'CONTRATO/RECIBO MENSALISTA',
      style: {
        textAlign: 'center',
        marginTop: '8px',
        fontSize: '14px',
        fontWeight: '700'
      }
    },
    {
      type: 'text',
      value: `Nome: ${clientData.name}`,
      style: { marginTop: '10px', fontSize: '12px' }
    },
    {
      type: 'text',
      value: `CPF: ${clientData.cpf || '-'}`,
      style: { marginTop: '2px', fontSize: '12px' }
    },
    {
      type: 'text',
      value: `Celular: ${clientData.phone || '-'}`,
      style: { marginTop: '2px', fontSize: '12px' }
    },
    {
      type: 'text',
      value: `Plano: ${planData.planName} - R$ ${valueFormatted} - Validade: ${expiryFormatted}`,
      style: { marginTop: '8px', fontSize: '12px' }
    },
    {
      type: 'text',
      value: `Veículos: ${vehiclesText}`,
      style: { marginTop: '4px', fontSize: '12px' }
    },
    {
      type: 'text',
      value: 'Declaro estar ciente das regras e horários do estacionamento.',
      style: { marginTop: '12px', fontSize: '10px', textAlign: 'center' }
    },
    {
      type: 'text',
      value: '_________________________________',
      style: { marginTop: '16px', textAlign: 'center', fontSize: '11px' }
    },
    {
      type: 'text',
      value: 'Assinatura',
      style: { marginTop: '2px', textAlign: 'center', fontSize: '10px' }
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
  await PosPrinter.print(fullContent, getBaseOptions() as any)
}

