import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
  getClients,
  toggleClientStatus,
  deleteClient,
  getClientStatement
} from '../../services/clients'
import ModalNovoCliente, { type ClientToEdit } from '../../components/ModalNovoCliente'
import ModalRenovar from '../../components/ModalRenovar'
import { useDialog } from '../../providers/DialogProvider'
import { friendlyError } from '../../utils/errorHandler'
import type { ClientRow, ClientStatement } from '../../types/domain'
import MensalistasTabela from './MensalistasTabela'
import DeleteClientModal from './DeleteClientModal'
import StatementModal from './StatementModal'

// Imperative handle interface — App pode pedir abrir o modal de novo cliente via ref (Ctrl+N)
export interface MensalistasHandle {
  openNewClientModal: () => void
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

  // Imperative handle: App.tsx chama ref.current?.openNewClientModal() no Ctrl+N
  useImperativeHandle(
    ref,
    () => ({
      openNewClientModal: () => {
        setClientToEdit(null)
        setModalNovoClienteOpen(true)
      }
    }),
    []
  )

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

  const openStatement = async (c: ClientRow): Promise<void> => {
    try {
      const data = await getClientStatement(c.id)
      setStatementData(data as ClientStatement | null)
      setStatementOpen(true)
    } catch (err) {
      console.error(err)
      showAlert('Erro', 'Não foi possível carregar o extrato. Tente novamente.', 'error')
    }
  }

  const openDeleteModal = (c: ClientRow): void => {
    setDeleteClientModal(c)
    setDeleteClientPassword('')
    setDeleteClientError('')
  }

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deleteClientModal) return
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
  }

  // Filtragem client-side — verbatim do App.tsx original
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
          onClick={() => {
            setClientToEdit(null)
            setModalNovoClienteOpen(true)
          }}
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
          <p className="text-xl font-bold text-red-400">
            {clients.filter((c) => c.financialStatus === 'Em atraso').length}
          </p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-400">Vence hoje</p>
          <p className="text-xl font-bold text-amber-400">
            {clients.filter((c) => c.financialStatus === 'Vence hoje').length}
          </p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <p className="text-xs text-gray-400">A vencer</p>
          <p className="text-xl font-bold text-blue-400">
            {clients.filter((c) => c.financialStatus === 'A vencer').length}
          </p>
        </div>
      </div>

      <MensalistasTabela
        clients={clients}
        filteredClients={filteredClients}
        onStatement={openStatement}
        onEditar={openEditarCliente}
        onRenovar={openRenovar}
        onDelete={openDeleteModal}
        onCancelConfirm={openCancelConfirm}
        onReativarConfirm={openReativarConfirm}
      />

      <ModalNovoCliente
        open={modalNovoClienteOpen}
        onClose={() => {
          setModalNovoClienteOpen(false)
          setClientToEdit(null)
        }}
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
        <DeleteClientModal
          client={deleteClientModal}
          password={deleteClientPassword}
          error={deleteClientError}
          loading={deleteClientLoading}
          onPasswordChange={(v) => {
            setDeleteClientPassword(v)
            setDeleteClientError('')
          }}
          onCancel={() => {
            setDeleteClientModal(null)
            setDeleteClientPassword('')
            setDeleteClientError('')
          }}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {statementOpen && (
        <StatementModal statementData={statementData} onClose={() => setStatementOpen(false)} />
      )}
    </div>
  )
})

Mensalistas.displayName = 'Mensalistas'

export default Mensalistas
