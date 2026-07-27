import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { getExcludedTickets } from '../services/reports'

export default function Excluidos(): React.JSX.Element {
  const [excludedTickets, setExcludedTickets] = useState<{
    id: number
    placa: string
    tipo: string
    entrada: string
    saida: string
  }[]>([])

  // Mostra em blocos: a lista cobre todo o histórico de exclusões e montar
  // tudo de uma vez congelava a tela em máquina antiga (Fase 13a).
  const PAGINA = 100
  const [visiveis, setVisiveis] = useState(PAGINA)

  useEffect(() => {
    getExcludedTickets().then(setExcludedTickets).catch(console.error)
  }, [])

  const visiveisLista = excludedTickets.slice(0, visiveis)

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-xl font-bold mb-6 text-white">Veículos excluídos</h2>
      <p className="text-sm text-gray-400 mb-4">Lista de veículos removidos sem cobrança (exclusão mediante senha no modal de saída).</p>
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-700/50">
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">Placa</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">Tipo</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">Entrada</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">Data exclusão</th>
              </tr>
            </thead>
            <tbody>
              {excludedTickets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">Nenhum veículo excluído</td>
                </tr>
              ) : (
                visiveisLista.map((t) => (
                  <tr key={t.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-white">{t.placa}</td>
                    <td className="px-4 py-3 text-gray-300">{t.tipo}</td>
                    <td className="px-4 py-3 text-gray-300">{format(new Date(t.entrada), 'dd/MM/yyyy HH:mm')}</td>
                    <td className="px-4 py-3 text-gray-300">{t.saida ? format(new Date(t.saida), 'dd/MM/yyyy HH:mm') : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {excludedTickets.length > visiveis && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-700 bg-gray-800/60">
            <p className="text-xs text-gray-400">
              Mostrando {visiveisLista.length} de {excludedTickets.length} exclusões
            </p>
            <button
              type="button"
              onClick={() => setVisiveis((n) => n + PAGINA)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium text-white whitespace-nowrap"
            >
              Mostrar mais {PAGINA}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
