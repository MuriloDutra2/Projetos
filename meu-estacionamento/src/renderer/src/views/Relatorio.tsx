import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { getDailyReport, saveDailyReport, exportDailyReportPdf } from '../services/reports'
import { getTickets } from '../services/tickets'
import { useDialog } from '../providers/DialogProvider'
import { friendlyError } from '../utils/errorHandler'

interface DailyReportData {
  totalAvulsos: number
  planosVendidosCount: number
  planosVendidosValue: number
  saved: { qtyCars: number; qtyMotos: number; createdAt: string } | null
}

export default function Relatorio(): React.JSX.Element {
  const { showAlert } = useDialog()
  const [reportDay, setReportDay] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'))
  const [dailyReport, setDailyReport] = useState<DailyReportData | null>(null)

  useEffect(() => {
    getDailyReport(reportDay).then(setDailyReport).catch(console.error)
  }, [reportDay])

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold text-white">Relatório do dia</h2>
        <input
          type="date"
          value={reportDay}
          onChange={(e) => setReportDay(e.target.value)}
          className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      {dailyReport && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Faturamento avulsos (R$)</p>
              <p className="text-2xl font-bold text-white">
                {dailyReport.totalAvulsos.toFixed(2).replace('.', ',')}
              </p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Planos vendidos (qtd)</p>
              <p className="text-2xl font-bold text-white">{dailyReport.planosVendidosCount}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Valor planos vendidos (R$)</p>
              <p className="text-2xl font-bold text-green-500">
                {dailyReport.planosVendidosValue.toFixed(2).replace('.', ',')}
              </p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Carros / Motos no pátio (salvo)</p>
              <p className="text-lg font-bold text-white">
                {dailyReport.saved
                  ? `${dailyReport.saved.qtyCars} / ${dailyReport.saved.qtyMotos}`
                  : '—'}
              </p>
              {dailyReport.saved && (
                <p className="text-xs text-gray-500 mt-1">
                  Salvo em {format(new Date(dailyReport.saved.createdAt), 'dd/MM/yyyy HH:mm')}
                </p>
              )}
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-300 mb-2 font-semibold">Tabela atual de mensalistas (referência)</p>
            <div className="text-sm text-gray-400 space-y-1">
              <p>Mensalista Carro 1: R$ 60,00</p>
              <p>Mensalista Moto: R$ 50,00</p>
              <p>Carro e Moto (ou 2 carros / 2 motos): R$ 75,00</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                const report = await getDailyReport(reportDay)
                const currentTickets = await getTickets()
                const qtyCars = currentTickets.filter((t) => t.tipo === 'Carro').length
                const qtyMotos = currentTickets.filter((t) => t.tipo === 'Moto').length
                const res = await saveDailyReport({
                  dateStr: reportDay,
                  totalAvulsos: report.totalAvulsos,
                  planosVendidosCount: report.planosVendidosCount,
                  planosVendidosValue: report.planosVendidosValue,
                  qtyCars,
                  qtyMotos
                })
                if (res.success) {
                  showAlert('Salvo', 'Relatório do dia salvo com sucesso.', 'success')
                  getDailyReport(reportDay).then(setDailyReport).catch(console.error)
                } else {
                  showAlert('Erro', friendlyError(res.error ?? 'Erro ao salvar'), 'error')
                }
              }}
              disabled={reportDay !== format(new Date(), 'yyyy-MM-dd')}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium text-white"
            >
              Salvar relatório do dia
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!dailyReport) return
                const res = await exportDailyReportPdf({
                  dateStr: reportDay,
                  totalAvulsos: dailyReport.totalAvulsos,
                  planosVendidosCount: dailyReport.planosVendidosCount,
                  planosVendidosValue: dailyReport.planosVendidosValue,
                  qtyCars: dailyReport.saved?.qtyCars ?? 0,
                  qtyMotos: dailyReport.saved?.qtyMotos ?? 0,
                  savedAt: dailyReport.saved
                    ? format(new Date(dailyReport.saved.createdAt), 'dd/MM/yyyy HH:mm')
                    : undefined
                })
                if (res.success && res.path) {
                  showAlert('PDF exportado', `Arquivo salvo em ${res.path}`, 'success')
                } else if (!res.canceled && res.error) {
                  showAlert('Erro', friendlyError(res.error), 'error')
                }
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white"
            >
              Baixar PDF
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {reportDay === format(new Date(), 'yyyy-MM-dd')
              ? 'Ao salvar, são gravados o faturamento de avulsos e planos do dia e a quantidade atual de carros e motos no pátio.'
              : 'Salvar está disponível apenas para o dia de hoje (a quantidade de carros/motos no pátio é do momento do salvamento).'}
          </p>
        </>
      )}
    </div>
  )
}
