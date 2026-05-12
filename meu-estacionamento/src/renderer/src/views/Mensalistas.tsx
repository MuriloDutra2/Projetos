import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { format } from 'date-fns'
import { clsx } from 'clsx'
import {
  getClients,
  toggleClientStatus,
  deleteClient,
  getClientStatement
} from '../services/clients'
import ModalNovoCliente from '../components/ModalNovoCliente'
import type { ClientToEdit } from '../components/ModalNovoCliente'
import ModalRenovar from '../components/ModalRenovar'
import { useDialog } from '../providers/DialogProvider'
import { friendlyError } from '../utils/errorHandler'
import { maskPlate } from '../utils/masks'
import type { ClientRow, ClientStatement } from '../types/domain'

export interface MensalistasHandle {
  openNewClientModal: () => void
}

function planLabel(planType: string): string {
  if (planType === 'MENSAL_CARRO') return 'Mensal Carro (2h30)'
  if (planType === 'MENSAL_MOTO') return 'Mensal Moto (2h30)'
  if (planType === 'MENSAL_CARRO_MOTO') return 'Mensal Carro e Moto'
  if (planType === 'GARAGEM') return 'Garagem'
  if (planType === 'FUNCIONARIO') return 'Funcionário'
  return planType
}

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

const Mensalistas = forwardRef<MensalistasHandle>((_props, ref): React.JSX.Element => {
  const { showAlert, showConfirm } = useDialog()

  const [clients, setClients] = useState<ClientRow[]>([])
  const [searchMensalistas, setSearchMensalistas] = useState<string>('')
  const [modalNovoClienteOpen, setModalNovoClienteOpen] = useState<boolean>(false)
  const [clientToEdit, setClientToEdit] = useState<ClientToEdit | null>(null)
  const [modalRenovarOpen, setModalRenovarOpen] = useState<boolean>(false)
  const [renovarClient, setRenovarClient] = useState<{
    clientId: number
    clientName: string
    planType: string
    clientCpf?: string
    clientPhone?: string
    clientPlates?: string[]
  } | null>(null)
  const [statementOpen, setStatementOpen] = useState<boolean>(false)
  const [statementData, setStatementData] = useState<ClientStatement | null>(null)
  const [deleteClientModal, setDeleteClientModal] = useState<ClientRow | null>(null)
  const [deleteClientPassword, setDeleteClientPassword] = useState<string>('')
  const [deleteClientError, setDeleteClientError] = useState<string>('')
  const [deleteClientLoading, setDeleteClientLoading] = useState<boolean>(false)

  const competenciaLabel = (competency?: string | null) => {
    if (!competency) return '—'
    const [y, m] = competency.split('-')
    return `${m}/${y}`
  }

  const loadClients = useCallback(async (): Promise<void> => {
    try {
      const data = await getClients()
      setClients(data)
    } catch (e) {
      console.error(e)
      setClients([])
      showAlert('Erro', 'Erro ao carregar mensalistas. Tente novamente.', 'error')
    }
  }, [showAlert])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  useImperativeHandle(ref, () => ({
    openNewClientModal: () => {
      setClientToEdit(null)
      setModalNovoClienteOpen(true)
    }
  }), [])

  const openEditarCliente = (c: ClientRow): void => {
    setClientToEdit({
      id: c.id,
      name: c.name,
      cpf: c.cpf,
      phone: c.phone,
      plan_type: c.plan_type,
      expiry_date: c.expiry_date,
      plates: c.plates ?? [],
      garage_billing_day: c.garage_billing_day ?? null,
      garage_billing_month: c.garage_billing_month ?? null
    })
    setModalNovoClienteOpen(true)
  }

  const openCancelConfirm = (c: ClientRow): void => {
    showConfirm(
      'Cancelar plano',
      `Deseja cancelar o plano de ${c.name}? O cliente perderá o acesso imediato.`,
      async () => {
        const res = await toggleClientStatus({ clientId: c.id, active: 0 })
        if (res.success) loadClients()
        else showAlert('Erro', friendlyError(res.error ?? 'Não foi possível cancelar'), 'error')
      }
    )
  }

  const openReativarConfirm = (c: ClientRow): void => {
    showConfirm(
      'Reativar cliente',
      `Deseja reativar o plano de ${c.name}?`,
      async () => {
        const res = await toggleClientStatus({ clientId: c.id, active: 1 })
        if (res.success) loadClients()
        else showAlert('Erro', friendlyError(res.error ?? 'Não foi possível reativar'), 'error')
      }
    )
  }

  const openRenovar = (c: ClientRow): void => {
    setRenovarClient({
      clientId: c.id,
      clientName: c.name,
      planType: c.plan_type,
      clientCpf: c.cpf,
      clientPhone: c.phone,
      clientPlates: c.plates ?? []
    })
    setModalRenovarOpen(true)
  }

  const searchLower = searchMensalistas.trim().toLowerCase()
  const searchDigits = searchLower.replace(/\D/g, '')
  const filteredClients =
    searchLower === ''
      ? clients
      : clients.filter((c) => {
          if (c.name.toLowerCase().includes(searchLower)) return true
          const cpfDigits = (c.cpf ?? '').replace(/\D/g, '')
          if (searchDigits.length >= 3 && cpfDigits.includes(searchDigits)) return true
          return (c.plates ?? []).some((p) => p.toLowerCase().includes(searchLower))
        })

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">Mensalistas</h2>
        <button
          type="button"
          onClick={() => { setClientToEdit(null); setModalNovoClienteOpen(true) }}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium text-white"
        >
          Novo Cadastro
        </button>
      </div>
      <div className="mb-4">
        <input
          type="text"
          value={searchMensalistas}
          onChange={(e) => setSearchMensalistas(e.target.value)}
          placeholder="Buscar por nome, CPF ou placa..."
          className="w-full max-w-md px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-400">Em atraso</p>
          <p className="text-xl font-bold text-red-400">{clients.filter((c) => c.financialStatus === 'Em atraso').length}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-400">Vence hoje</p>
          <p className="text-xl font-bold text-amber-400">{clients.filter((c) => c.financialStatus === 'Vence hoje').length}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-400">A vencer</p>
          <p className="text-xl font-bold text-blue-400">{clients.filter((c) => c.financialStatus === 'A vencer').length}</p>
        </div>
      </div>
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
                    {clients.length === 0 ? 'Nenhum mensalista cadastrado' : 'Nenhum resultado na busca'}
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
                    <td className="px-4 py-3 text-gray-300">{format(new Date(c.expiry_date), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {c.lastPaymentDate ? format(new Date(c.lastPaymentDate), 'dd/MM/yyyy HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{competenciaLabel(c.lastPaymentCompetency)}</td>
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
                        onClick={async () => {
                          const data = await getClientStatement(c.id)
                          setStatementData(data as ClientStatement | null)
                          setStatementOpen(true)
                        }}
                        className="p-2 text-gray-400 hover:text-blue-400 rounded"
                        title="Extrato"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5l5 5v11a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditarCliente(c)}
                        className="p-2 text-gray-400 hover:text-amber-400 rounded"
                        title="Editar"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => openRenovar(c)}
                        className="p-2 text-gray-400 hover:text-green-400 rounded"
                        title="Renovar"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteClientModal(c)
                          setDeleteClientPassword('')
                          setDeleteClientError('')
                        }}
                        className="p-2 text-gray-400 hover:text-red-400 rounded"
                        title="Excluir cadastro"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 12h-6" />
                        </svg>
                      </button>
                      {c.status === 'Inativo' ? (
                        <button
                          type="button"
                          onClick={() => openReativarConfirm(c)}
                          className="p-2 text-gray-400 hover:text-green-400 rounded"
                          title="Reativar"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openCancelConfirm(c)}
                          className="p-2 text-gray-400 hover:text-amber-400 rounded"
                          title="Cancelar plano"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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

      <ModalNovoCliente
        open={modalNovoClienteOpen}
        onClose={() => { setModalNovoClienteOpen(false); setClientToEdit(null) }}
        onSuccess={loadClients}
        onAlert={showAlert}
        clientToEdit={clientToEdit}
      />

      {renovarClient && (
        <ModalRenovar
          open={modalRenovarOpen}
          onClose={() => {
            setModalRenovarOpen(false)
            setRenovarClient(null)
          }}
          onSuccess={loadClients}
          clientId={renovarClient.clientId}
          clientName={renovarClient.clientName}
          planType={renovarClient.planType}
          clientCpf={renovarClient.clientCpf}
          clientPhone={renovarClient.clientPhone}
          clientPlates={renovarClient.clientPlates}
          onAlert={showAlert}
        />
      )}

      {deleteClientModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[75]">
          <div
            className="bg-gray-800 border border-blue-500/80 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-2">Excluir mensalista</h3>
            <p className="text-sm text-gray-300 mb-4">
              Digite a senha para excluir permanentemente o cadastro de <strong>{deleteClientModal.name}</strong>. O
              histórico de pagamentos e tickets finalizados permanece no sistema para auditoria.
            </p>
            <input
              type="password"
              value={deleteClientPassword}
              onChange={(e) => {
                setDeleteClientPassword(e.target.value)
                setDeleteClientError('')
              }}
              placeholder="Senha"
              className="w-full px-3 py-2 mb-2 bg-gray-700 border border-red-500/60 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              autoComplete="off"
            />
            {deleteClientError && <p className="text-sm text-red-400 mb-3">{deleteClientError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                disabled={deleteClientLoading}
                onClick={() => {
                  setDeleteClientModal(null)
                  setDeleteClientPassword('')
                  setDeleteClientError('')
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteClientLoading}
                onClick={async () => {
                  setDeleteClientLoading(true)
                  setDeleteClientError('')
                  try {
                    const res = await deleteClient({
                      clientId: deleteClientModal.id,
                      password: deleteClientPassword
                    })
                    if (res.success) {
                      setDeleteClientModal(null)
                      setDeleteClientPassword('')
                      showAlert('Excluído', 'Cadastro do cliente removido.', 'success')
                      await loadClients()
                    } else {
                      setDeleteClientError(res.error ?? 'Não foi possível excluir.')
                    }
                  } catch (err) {
                    setDeleteClientError(friendlyError(err))
                  } finally {
                    setDeleteClientLoading(false)
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {deleteClientLoading ? 'Aguarde...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {statementOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70]" onClick={() => setStatementOpen(false)}>
          <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 max-w-3xl w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Extrato do mensalista</h3>
              <button type="button" onClick={() => setStatementOpen(false)} className="text-gray-300 hover:text-white">Fechar</button>
            </div>
            {!statementData ? (
              <p className="text-gray-400">Nenhum dado encontrado.</p>
            ) : (
              <>
                <p className="text-sm text-gray-300 mb-3">
                  Cliente: <strong>{statementData.client.name}</strong> | Total pagamentos: R$ {statementData.totals.payments.toFixed(2).replace('.', ',')} | Avulsos em atraso: R$ {statementData.totals.avulsos.toFixed(2).replace('.', ',')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white mb-2">Pagamentos</p>
                    <div className="space-y-1 text-xs text-gray-300">
                      {statementData.payments.slice(0, 20).map((p) => (
                        <div key={p.id} className="bg-gray-700/60 rounded p-2">
                          {format(new Date(p.payment_date), 'dd/MM/yyyy HH:mm')} - R$ {p.amount.toFixed(2).replace('.', ',')} - {p.payment_method} {p.competency_month ? `- comp ${competenciaLabel(p.competency_month)}` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white mb-2">Avulsos em período de atraso</p>
                    <div className="space-y-1 text-xs text-gray-300">
                      {statementData.avulsoWhileDebtor.slice(0, 20).map((t) => (
                        <div key={t.id} className="bg-gray-700/60 rounded p-2">
                          {t.placa} - {format(new Date(t.saida), 'dd/MM/yyyy HH:mm')} - R$ {(t.valor ?? 0).toFixed(2).replace('.', ',')}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

Mensalistas.displayName = 'Mensalistas'

export default Mensalistas
