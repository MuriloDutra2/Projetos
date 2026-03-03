import { useState } from 'react'
import { differenceInMinutes } from 'date-fns'

interface ModalCheckoutProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  onExclude?: () => void
  ticketId?: number
  placa: string
  tipo: string
  entrada: string
  valor: number
  loading?: boolean
}

function formatarTempo(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const mins = minutos % 60
  return mins > 0 ? `${horas}h ${mins}min` : `${horas}h`
}

export default function ModalCheckout({
  open,
  onClose,
  onConfirm,
  onExclude,
  ticketId,
  placa,
  tipo,
  entrada,
  valor,
  loading = false
}: ModalCheckoutProps): React.JSX.Element | null {
  const [showExcludeForm, setShowExcludeForm] = useState(false)
  const [excludePassword, setExcludePassword] = useState('')
  const [excludeError, setExcludeError] = useState('')
  const [excludeLoading, setExcludeLoading] = useState(false)

  if (!open) return null

  const tempoTotal = differenceInMinutes(new Date(), new Date(entrada))
  const valorFormatado = valor.toFixed(2).replace('.', ',')

  const handleExcludeSubmit = async () => {
    if (ticketId == null || !onExclude) return
    setExcludeLoading(true)
    setExcludeError('')
    try {
      const res = await window.api.excludeTicket({ id: ticketId, password: excludePassword })
      if (res.success) {
        setShowExcludeForm(false)
        setExcludePassword('')
        onExclude()
        onClose()
      } else {
        setExcludeError(res.error ?? 'Senha incorreta.')
      }
    } finally {
      setExcludeLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Confirmar Saída</h2>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm text-gray-400 mb-1">Placa</p>
            <p className="text-3xl font-bold text-white tracking-wider">{placa}</p>
            <p className="text-sm text-gray-500 mt-1">{tipo}</p>
          </div>

          <div>
            <p className="text-sm text-gray-400">Tempo total de permanência</p>
            <p className="text-lg font-semibold text-white">{formatarTempo(tempoTotal)}</p>
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-1">Valor a pagar</p>
            <p
              className={`text-2xl font-bold ${valor === 0 ? 'text-green-500' : 'text-red-400'}`}
            >
              R$ {valorFormatado}
            </p>
          </div>
        </div>

        {showExcludeForm && ticketId != null && onExclude ? (
          <div className="p-6 border-t border-gray-700 bg-gray-900/50 space-y-3">
            <p className="text-sm text-gray-400">Excluir veículo (sem cobrança). Digite a senha para confirmar:</p>
            <input
              type="password"
              value={excludePassword}
              onChange={(e) => { setExcludePassword(e.target.value); setExcludeError('') }}
              placeholder="Senha"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              maxLength={10}
            />
            {excludeError && <p className="text-sm text-red-400">{excludeError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowExcludeForm(false); setExcludePassword(''); setExcludeError('') }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExcludeSubmit}
                disabled={excludeLoading || !excludePassword.trim()}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium"
              >
                {excludeLoading ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="p-6 flex gap-3 bg-gray-800/80">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 px-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2h2zm-8-12v4m0 0v4m0-4h4m-4 0H9"
              />
            </svg>
            {loading ? 'Processando...' : valor > 0 ? 'Confirmar e Imprimir' : 'Apenas confirmar (sem imprimir)'}
          </button>
        </div>

        {!showExcludeForm && ticketId != null && onExclude ? (
          <div className="px-6 pb-4">
            <button
              type="button"
              onClick={() => setShowExcludeForm(true)}
              className="text-sm text-gray-500 hover:text-red-400 transition-colors"
            >
              Excluir veículo (sem cobrança)
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
