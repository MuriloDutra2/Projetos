import { useState, useEffect } from 'react'
import { maskCPF, maskPhone } from '../utils/masks'
import { friendlyError } from '../utils/errorHandler'

const PLANO_NOMES: Record<string, string> = {
  MENSAL_CARRO: 'Mensal Carro (2h30)',
  MENSAL_MOTO: 'Mensal Moto (2h30)',
  MENSAL_CARRO_MOTO: 'Mensal Carro e Moto',
  GARAGEM: 'Garagem',
  FUNCIONARIO: 'Funcionário (Livre)'
}

/** Permite apenas números e vírgula; formata como 0,00 */
function maskCurrency(value: string): string {
  const cleaned = value.replace(/[^\d,]/g, '')
  const parts = cleaned.split(',')
  if (parts.length > 2) return value
  if (parts.length === 2 && parts[1].length > 2) {
    parts[1] = parts[1].slice(0, 2)
    return parts.join(',')
  }
  return cleaned
}

function parseCurrencyToNumber(value: string): number {
  if (!value || !value.trim()) return 0
  const normalized = value.trim().replace(',', '.')
  return Math.max(0, Number(normalized) || 0)
}

interface ModalRenovarProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  clientId: number
  clientName: string
  planType: string
  clientCpf?: string
  clientPhone?: string
  clientPlates?: string[]
  onAlert?: (title: string, message: string, type: 'error' | 'success') => void
}

export default function ModalRenovar({
  open,
  onClose,
  onSuccess,
  clientId,
  clientName,
  planType,
  clientCpf = '',
  clientPhone = '',
  clientPlates = [],
  onAlert
}: ModalRenovarProps): React.JSX.Element | null {
  const [amountStr, setAmountStr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setAmountStr('')
  }, [open])

  if (!open) return null

  const showAlert = (title: string, message: string, type: 'error' | 'success') => {
    if (onAlert) onAlert(title, message, type)
    else alert(message)
  }

  const handleConfirm = async () => {
    const amount = parseCurrencyToNumber(amountStr)
    if (amount <= 0) {
      showAlert('Valor inválido', 'Informe um valor maior que zero.', 'error')
      return
    }

    setLoading(true)
    try {
      const result = await window.api.renewSubscription({
        clientId,
        planType,
        amount
      })
      if (result.success) {
        try {
          const cpfFormatted =
            clientCpf && clientCpf.replace(/\D/g, '').length === 11
              ? maskCPF(clientCpf)
              : clientCpf || '-'
          const phoneFormatted = clientPhone ? maskPhone(clientPhone) : '-'
          const printRes = await window.api.printSubscription({
            clientData: {
              name: clientName,
              cpf: cpfFormatted,
              phone: phoneFormatted
            },
            vehicleList: clientPlates,
            planData: {
              planName: PLANO_NOMES[planType] ?? planType,
              value: amount,
              expiryDate: result.newExpiry ?? ''
            }
          })
          if (printRes && !printRes.success && onAlert) {
            onAlert('Erro de impressão', friendlyError(printRes.error ?? 'printer'), 'error')
          }
        } catch (err) {
          console.error('Erro ao imprimir recibo:', err)
          if (onAlert) onAlert('Erro de impressão', friendlyError(err), 'error')
        }
        onSuccess()
        onClose()
      } else {
        showAlert('Erro ao renovar', friendlyError(result.error ?? 'renovar'), 'error')
      }
    } catch (err) {
      console.error(err)
      showAlert('Erro', friendlyError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const label = PLANO_NOMES[planType] ?? planType

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">
            Renovar Plano de {clientName}
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm text-gray-400">Plano atual</p>
            <p className="font-medium text-white">{label}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Valor (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(maskCurrency(e.target.value))}
              placeholder="0,00"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-medium"
            >
              {loading ? 'Processando...' : 'Confirmar Pagamento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
