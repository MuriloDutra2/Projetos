import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { clsx } from 'clsx'
import { getHistoryForDay, getHistoryLast24h } from '../services/reports'
import type { HistoryEntry } from '../types/domain'
import { maskPlate, plateToRaw } from '../utils/masks'

export default function Historico(): React.JSX.Element {
  const [historyDay, setHistoryDay] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'))
  const [historyForDay, setHistoryForDay] = useState<HistoryEntry[]>([])
  const [historyLast24h, setHistoryLast24h] = useState<HistoryEntry[]>([])
  const [historicoFiltro24h, setHistoricoFiltro24h] = useState<boolean>(false)
  const [searchHistoricoPlaca, setSearchHistoricoPlaca] = useState<string>('')

  useEffect(() => {
    if (historicoFiltro24h) {
      getHistoryLast24h().then(setHistoryLast24h).catch(console.error)
    } else {
      getHistoryForDay(historyDay).then(setHistoryForDay).catch(console.error)
    }
  }, [historyDay, historicoFiltro24h])

  const historyBaseList = historicoFiltro24h ? historyLast24h : historyForDay
  const searchHistoricoNorm = plateToRaw(searchHistoricoPlaca).toUpperCase()
  const historyFilteredList =
    searchHistoricoNorm.length === 0
      ? historyBaseList
      : historyBaseList.filter((h) =>
          (h.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').includes(searchHistoricoNorm)
        )

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold text-white">
          {historicoFiltro24h ? 'Últimas 24 horas' : 'Histórico do dia'}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {!historicoFiltro24h && (
            <input
              type="date"
              value={historyDay}
              onChange={(e) => setHistoryDay(e.target.value)}
              className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          )}
          <button
            type="button"
            onClick={() => setHistoricoFiltro24h((v) => !v)}
            className={clsx(
              'px-4 py-2 rounded-lg font-medium transition',
              historicoFiltro24h
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
          >
            Últimas 24h
          </button>
        </div>
      </div>
      <div className="mb-4">
        <input
          type="text"
          value={searchHistoricoPlaca}
          onChange={(e) => setSearchHistoricoPlaca(plateToRaw(e.target.value))}
          placeholder="Buscar por placa..."
          className="w-full max-w-xs px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-400">
            {historicoFiltro24h ? 'Veículos (últimas 24h)' : `Veículos no dia (${format(new Date(historyDay + 'T12:00:00'), 'dd/MM/yyyy')})`}
          </p>
          <p className="text-2xl font-bold text-white">{historyFilteredList.length}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-400">Faturamento (R$)</p>
          <p className="text-2xl font-bold text-green-500">
            {historyFilteredList.reduce((s, h) => s + (h.valor ?? 0), 0).toFixed(2).replace('.', ',')}
          </p>
        </div>
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-700/50">
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">Placa</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">Entrada</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">Saída</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {historyFilteredList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    {historyBaseList.length === 0
                      ? (historicoFiltro24h ? 'Nenhum registro nas últimas 24h' : 'Nenhum registro finalizado neste dia')
                      : 'Nenhum resultado na busca por placa'}
                  </td>
                </tr>
              ) : (
                historyFilteredList.map((h) => (
                  <tr key={h.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-white">{maskPlate(h.placa)}</td>
                    <td className="px-4 py-3 text-gray-300">{format(new Date(h.entrada), 'dd/MM HH:mm')}</td>
                    <td className="px-4 py-3 text-gray-300">{h.saida ? format(new Date(h.saida), 'dd/MM HH:mm') : '-'}</td>
                    <td className="px-4 py-3 text-right font-medium text-white">
                      R$ {(h.valor ?? 0).toFixed(2).replace('.', ',')}
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
