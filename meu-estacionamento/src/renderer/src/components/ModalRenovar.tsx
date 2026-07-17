import { useState, useEffect } from 'react'
import { maskCPF, maskPhone, maskCurrency, parseCurrencyToNumber } from '../utils/masks'
import { friendlyError } from '../utils/errorHandler'

const PLANO_NOMES: Record<string, string> = {
  MENSAL_CARRO: 'Mensal Carro (2h30)',
  MENSAL_MOTO: 'Mensal Moto (2h30)',
  MENSAL_CARRO_MOTO: 'Mensal Carro e Moto',
  GARAGEM: 'Garagem',
  FUNCIONARIO: 'Funcionário (Livre)'
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
  const [months, setMonths] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState('Pix')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  // Fase 12 — pagamento dividido em duas formas (só para 1 mês)
  const [splitEnabled, setSplitEnabled] = useState(false)
  const [splitMethod, setSplitMethod] = useState('Dinheiro')
  const [splitAmountStr, setSplitAmountStr] = useState('')

  useEffect(() => {
    if (open) {
      setAmountStr('')
      setMonths(1)
      setPaymentMethod('Pix')
      setNotes('')
      setSplitEnabled(false)
      setSplitMethod('Dinheiro')
      setSplitAmountStr('')
    }
  }, [open])

  if (!open) return null

  const showAlert = (title: string, message: string, type: 'error' | 'success') => {
    if (onAlert) onAlert(title, message, type)
    else alert(message)
  }

  const isMensal = planType.startsWith('MENSAL')
  const monthsPaid = isMensal ? months : 1
  const splitActive = splitEnabled && monthsPaid === 1

  const handleConfirm = async () => {
    const amount = parseCurrencyToNumber(amountStr)
    if (amount <= 0) {
      showAlert('Valor inválido', 'Informe um valor maior que zero.', 'error')
      return
    }
    let splitPayment: { method: string; amount: number } | null = null
    if (splitActive) {
      const splitAmount = parseCurrencyToNumber(splitAmountStr)
      if (!(splitAmount > 0) || splitAmount >= amount) {
        showAlert(
          'Divisão inválida',
          'O valor da segunda forma deve ser maior que zero e menor que o total.',
          'error'
        )
        return
      }
      if (splitMethod === paymentMethod) {
        showAlert('Divisão inválida', 'Escolha duas formas de pagamento diferentes.', 'error')
        return
      }
      splitPayment = { method: splitMethod, amount: splitAmount }
    }

    setLoading(true)
    try {
      const result = await window.api.renewSubscription({
        clientId,
        planType,
        amount,
        months: monthsPaid,
        paymentMethod,
        notes,
        splitPayment
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
              planName:
                monthsPaid > 1
                  ? `${PLANO_NOMES[planType] ?? planType} (${monthsPaid} meses)`
                  : (PLANO_NOMES[planType] ?? planType),
              value: amount * monthsPaid,
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
              {isMensal ? 'Valor por mês (R$)' : 'Valor (R$)'}
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
          {isMensal && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Meses para pagar
              </label>
              <select
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              >
                {[1, 2, 3, 6, 12].map((m) => (
                  <option key={m} value={m}>
                    {m} mês{m > 1 ? 'es' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {parseCurrencyToNumber(amountStr) > 0 && (
            <div className="bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2">
              <p className="text-sm text-gray-300">
                Total a receber:{' '}
                <span className="font-bold text-green-500">
                  R$ {(parseCurrencyToNumber(amountStr) * monthsPaid).toFixed(2).replace('.', ',')}
                </span>
                {monthsPaid > 1 && (
                  <span className="text-gray-400">
                    {' '}
                    ({monthsPaid} meses de R${' '}
                    {parseCurrencyToNumber(amountStr).toFixed(2).replace('.', ',')})
                  </span>
                )}
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Forma de pagamento
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            >
              <option>Pix</option>
              <option>Dinheiro</option>
              <option>Cartão</option>
              <option>Transferência</option>
            </select>
          </div>
          {monthsPaid === 1 && (
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={splitEnabled}
                  onChange={(e) => setSplitEnabled(e.target.checked)}
                  className="w-4 h-4 accent-green-600"
                />
                Dividir pagamento em duas formas
              </label>
              {splitActive && (
                <div className="mt-2 p-3 bg-gray-700/50 border border-gray-600 rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={splitMethod}
                      onChange={(e) => setSplitMethod(e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    >
                      <option>Pix</option>
                      <option>Dinheiro</option>
                      <option>Cartão</option>
                      <option>Transferência</option>
                    </select>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={splitAmountStr}
                      onChange={(e) => setSplitAmountStr(maskCurrency(e.target.value))}
                      placeholder="0,00"
                      className="w-28 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500"
                    />
                  </div>
                  {parseCurrencyToNumber(amountStr) > 0 && parseCurrencyToNumber(splitAmountStr) > 0 && (
                    <p className="text-xs text-gray-400">
                      {paymentMethod}: R${' '}
                      {(parseCurrencyToNumber(amountStr) - parseCurrencyToNumber(splitAmountStr))
                        .toFixed(2)
                        .replace('.', ',')}{' '}
                      · {splitMethod}: R${' '}
                      {parseCurrencyToNumber(splitAmountStr).toFixed(2).replace('.', ',')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Observação (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: pagamento antecipado"
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
