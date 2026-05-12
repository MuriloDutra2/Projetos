import type { ClientRow } from '../../types/domain'

interface DeleteClientModalProps {
  client: ClientRow
  password: string
  error: string
  loading: boolean
  onPasswordChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => Promise<void>
}

export default function DeleteClientModal({
  client,
  password,
  error,
  loading,
  onPasswordChange,
  onCancel,
  onConfirm
}: DeleteClientModalProps): React.JSX.Element {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[75]">
      <div
        className="bg-gray-800 border border-blue-500/80 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-white mb-2">Excluir mensalista</h3>
        <p className="text-sm text-gray-300 mb-4">
          Digite a senha para excluir permanentemente o cadastro de{' '}
          <strong>{client.name}</strong>. O histórico de pagamentos e tickets finalizados
          permanece no sistema para auditoria.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="Senha"
          className="w-full px-3 py-2 mb-2 bg-gray-700 border border-red-500/60 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
          autoComplete="off"
        />
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50"
          >
            {loading ? 'Aguarde...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}
