import { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { clsx } from 'clsx'
import { getFinanceMonthData, exportFinancialCsv, type FinanceMonthData } from '../services/financial'
import { useDialog } from '../providers/DialogProvider'
import { friendlyError } from '../utils/errorHandler'
import { mergeTransactions } from '../utils/transactions'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function Financeiro(): React.JSX.Element {
  const { showAlert } = useDialog()
  const now = new Date()
  const [financeFilterMonth, setFinanceFilterMonth] = useState<number>(now.getMonth() + 1)
  const [financeFilterYear, setFinanceFilterYear] = useState<number>(now.getFullYear())
  const [monthData, setMonthData] = useState<FinanceMonthData | null>(null)

  useEffect(() => {
    // Totais somados no SQL sobre o mês completo (antes: soma no JS de listas com LIMIT)
    getFinanceMonthData({ month: financeFilterMonth, year: financeFilterYear })
      .then(setMonthData)
      .catch(console.error)
  }, [financeFilterMonth, financeFilterYear])

  const totalAvulsosMes = monthData?.totalAvulsos ?? 0
  const totalRenovacoesMes = monthData?.totalRenovacoes ?? 0
  const financialByMethod = monthData?.byMethod ?? []

  const mixedTransactions = useMemo(
    () => (monthData ? mergeTransactions(monthData.tickets, monthData.payments) : []),
    [monthData]
  )

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h2 className="text-xl font-bold text-white">Financeiro</h2>
        <div className="flex items-center gap-2">
          <select
            value={financeFilterMonth}
            onChange={(e) => setFinanceFilterMonth(Number(e.target.value))}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
          >
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={financeFilterYear}
            onChange={(e) => setFinanceFilterYear(Number(e.target.value))}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={async () => {
            const res = await exportFinancialCsv({ month: financeFilterMonth, year: financeFilterYear })
            if (res.success && res.path) showAlert('Exportado', `Arquivo salvo em ${res.path}`, 'success')
            else if (!res.canceled && res.error) showAlert('Erro', friendlyError(res.error), 'error')
          }}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white"
        >
          Exportar CSV do mês
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-400">Total Recebido (Renovações) - {MESES[financeFilterMonth - 1]}/{financeFilterYear}</p>
          <p className="text-2xl font-bold text-green-500">
            R$ {totalRenovacoesMes.toFixed(2).replace('.', ',')}
          </p>
          {financialByMethod.length > 0 && (
            <div className="mt-2 space-y-1">
              {financialByMethod.map((m) => (
                <p key={m.payment_method} className="text-xs text-gray-300">
                  {m.payment_method}: R$ {(m.total ?? 0).toFixed(2).replace('.', ',')}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-400">Total Recebido (Avulsos) - {MESES[financeFilterMonth - 1]}/{financeFilterYear}</p>
          <p className="text-2xl font-bold text-white">
            R$ {totalAvulsosMes.toFixed(2).replace('.', ',')}
          </p>
        </div>
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-700/50">
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">Data</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">Tipo</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">Descrição</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {mixedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">Nenhuma transação</td>
                </tr>
              ) : (
                mixedTransactions.map((t, i) => (
                  <tr key={`${t.type}-${t.date}-${i}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-gray-300">{format(new Date(t.date), 'dd/MM/yyyy HH:mm')}</td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          'px-2 py-1 rounded text-xs font-medium',
                          t.type === 'renovacao' ? 'bg-green-900/60 text-green-300' : 'bg-gray-600 text-gray-200'
                        )}
                      >
                        {t.type === 'renovacao' ? 'Renovação' : 'Avulso'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white">{t.description}</td>
                    <td className="px-4 py-3 text-right font-medium text-white">
                      R$ {t.value.toFixed(2).replace('.', ',')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
