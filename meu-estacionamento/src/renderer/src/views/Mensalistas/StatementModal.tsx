import { format } from 'date-fns'
import type { ClientStatement } from '../../types/domain'

interface StatementModalProps {
  statementData: ClientStatement | null
  onClose: () => void
}

function competenciaLabel(competency?: string | null): string {
  if (!competency) return '—'
  const [y, m] = competency.split('-')
  return `${m}/${y}`
}

export default function StatementModal({
  statementData,
  onClose
}: StatementModalProps): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70]"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-xl p-6 max-w-3xl w-full mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Extrato do mensalista</h3>
          <button type="button" onClick={onClose} className="text-gray-300 hover:text-white">
            Fechar
          </button>
        </div>
        {!statementData ? (
          <p className="text-gray-400">Nenhum dado encontrado.</p>
        ) : (
          <>
            <p className="text-sm text-gray-300 mb-3">
              Cliente: <strong>{statementData.client.name}</strong> | Total pagamentos: R${' '}
              {statementData.totals.payments.toFixed(2).replace('.', ',')} | Avulsos em atraso: R${' '}
              {statementData.totals.avulsos.toFixed(2).replace('.', ',')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-white mb-2">Pagamentos</p>
                <div className="space-y-1 text-xs text-gray-300">
                  {statementData.payments.slice(0, 20).map((p) => (
                    <div key={p.id} className="bg-gray-700/60 rounded p-2">
                      {format(new Date(p.payment_date), 'dd/MM/yyyy HH:mm')} - R${' '}
                      {p.amount.toFixed(2).replace('.', ',')} - {p.payment_method}{' '}
                      {p.competency_month ? `- comp ${competenciaLabel(p.competency_month)}` : ''}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-2">
                  Avulsos em período de atraso
                </p>
                <div className="space-y-1 text-xs text-gray-300">
                  {statementData.avulsoWhileDebtor.slice(0, 20).map((t) => (
                    <div key={t.id} className="bg-gray-700/60 rounded p-2">
                      {t.placa} - {format(new Date(t.saida), 'dd/MM/yyyy HH:mm')} - R${' '}
                      {(t.valor ?? 0).toFixed(2).replace('.', ',')}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
