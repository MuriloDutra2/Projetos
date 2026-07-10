import { format } from 'date-fns'
import { clsx } from 'clsx'
import { maskPlate } from '../../utils/masks'
import type { ClientRow } from '../../types/domain'

function planLabel(planType: string): string {
  if (planType === 'MENSAL_CARRO') return 'Mensal Carro (2h30)'
  if (planType === 'MENSAL_MOTO') return 'Mensal Moto (2h30)'
  if (planType === 'MENSAL_CARRO_MOTO') return 'Mensal Carro e Moto'
  if (planType === 'GARAGEM') return 'Garagem'
  if (planType === 'FUNCIONARIO') return 'Funcionário'
  return planType
}

function competenciaLabel(competency?: string | null): string {
  if (!competency) return '—'
  const [y, m] = competency.split('-')
  return `${m}/${y}`
}

/** Formata placas para exibição: "PLACA1, PLACA2 (+X)" com tooltip completo */
function formatPlatesDisplay(plates: string[]): { text: string; title: string } {
  const list = plates ?? []
  if (list.length === 0) return { text: '-', title: '' }
  const formatted = list.map((p) => maskPlate(p))
  const fullList = formatted.join(', ')
  if (list.length <= 2) return { text: fullList, title: fullList }
  const visible = formatted.slice(0, 2).join(', ')
  const extra = list.length - 2
  return { text: `${visible} (+${extra})`, title: fullList }
}

interface MensalistasTableProps {
  clients: ClientRow[]
  filteredClients: ClientRow[]
  onStatement: (c: ClientRow) => Promise<void>
  onEditar: (c: ClientRow) => void
  onRenovar: (c: ClientRow) => void
  onDelete: (c: ClientRow) => void
  onCancelConfirm: (c: ClientRow) => void
  onReativarConfirm: (c: ClientRow) => void
}

export default function MensalistasTabela({
  clients,
  filteredClients,
  onStatement,
  onEditar,
  onRenovar,
  onDelete,
  onCancelConfirm,
  onReativarConfirm
}: MensalistasTableProps): React.JSX.Element {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-700/50">
              <th className="px-4 py-3 text-sm font-semibold text-gray-300">Nome</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-300">Plano</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-300">Cobr. garagem</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-300">Vencimento</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-300">Último pagamento</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-300">Competência</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-300">Sit. financeira</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-300">Status</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-300">Placas</th>
              <th className="px-4 py-3 text-sm font-semibold text-gray-300">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                  {clients.length === 0
                    ? 'Nenhum mensalista cadastrado'
                    : 'Nenhum resultado na busca'}
                </td>
              </tr>
            ) : (
              filteredClients.map((c) => (
                <tr
                  key={c.id}
                  className={clsx(
                    'border-b border-gray-700/50',
                    c.isDebtor ? 'bg-red-900/40 hover:bg-red-900/60' : 'hover:bg-gray-700/30'
                  )}
                >
                  <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                  <td className="px-4 py-3 text-gray-300">{planLabel(c.plan_type)}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {c.plan_type === 'GARAGEM' ? c.garageBillingLabel ?? '—' : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {c.expiry_date
                      ? format(new Date(c.expiry_date.slice(0, 10) + 'T12:00:00'), 'dd/MM/yyyy')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {c.lastPaymentDate
                      ? format(new Date(c.lastPaymentDate), 'dd/MM/yyyy HH:mm')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {competenciaLabel(c.lastPaymentCompetency)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'px-2 py-1 rounded text-xs font-medium',
                        c.financialStatus === 'Em atraso' && 'bg-red-900/60 text-red-300',
                        c.financialStatus === 'Vence hoje' && 'bg-amber-900/60 text-amber-300',
                        c.financialStatus === 'A vencer' && 'bg-blue-900/60 text-blue-300',
                        c.financialStatus === 'Em dia' && 'bg-green-900/60 text-green-300'
                      )}
                    >
                      {c.financialStatus ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'px-2 py-1 rounded text-xs font-medium',
                        c.status === 'Ativo' && 'bg-green-900/60 text-green-300',
                        c.status === 'Vencido' && 'bg-red-900/60 text-red-300',
                        c.status === 'Inativo' && 'bg-slate-600 text-slate-300'
                      )}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 text-gray-300"
                    title={formatPlatesDisplay(c.plates ?? []).title}
                  >
                    {formatPlatesDisplay(c.plates ?? []).text}
                  </td>
                  <td className="px-4 py-3 flex gap-1">
                    <button
                      type="button"
                      onClick={() => onStatement(c)}
                      className="p-2 text-gray-400 hover:text-blue-400 rounded"
                      title="Extrato"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5l5 5v11a2 2 0 01-2 2z"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditar(c)}
                      className="p-2 text-gray-400 hover:text-amber-400 rounded"
                      title="Editar"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRenovar(c)}
                      className="p-2 text-gray-400 hover:text-green-400 rounded"
                      title="Renovar"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(c)}
                      className="p-2 text-gray-400 hover:text-red-400 rounded"
                      title="Excluir cadastro"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M22 12h-6"
                        />
                      </svg>
                    </button>
                    {c.status === 'Inativo' ? (
                      <button
                        type="button"
                        onClick={() => onReativarConfirm(c)}
                        className="p-2 text-gray-400 hover:text-green-400 rounded"
                        title="Reativar"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCancelConfirm(c)}
                        className="p-2 text-gray-400 hover:text-amber-400 rounded"
                        title="Cancelar plano"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                          />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
