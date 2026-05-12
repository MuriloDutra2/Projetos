import { useState, useEffect, useCallback } from 'react'
import {
  listFamilyGroups,
  createFamilyGroup,
  addFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  deleteFamilyGroup
} from '../services/family'
import { useDialog } from '../providers/DialogProvider'
import { maskCPF, maskPlate, plateToRaw, unmask } from '../utils/masks'

interface EditingMember {
  id: number
  name: string
  cpf: string
}

interface NewMemberForm {
  groupId: number
  name: string
  cpf: string
}

export default function GruposFamiliares() {
  const { showAlert, showConfirm } = useDialog()
  const [groups, setGroups] = useState<FamilyGroup[]>([])
  const [searchPlate, setSearchPlate] = useState('')
  const [showAddGroupForm, setShowAddGroupForm] = useState(false)
  const [newGroupPlate, setNewGroupPlate] = useState('')
  const [editingMember, setEditingMember] = useState<EditingMember | null>(null)
  const [newMemberForm, setNewMemberForm] = useState<NewMemberForm | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    const data = await listFamilyGroups()
    setGroups(data)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const filtered = searchPlate.trim()
    ? groups.filter((g) => g.plate.includes(plateToRaw(searchPlate)))
    : groups

  const handleCreateGroup = async () => {
    const plate = plateToRaw(newGroupPlate)
    if (plate.length < 5) {
      showAlert('Atenção', 'Informe uma placa válida (mínimo 5 caracteres).', 'error')
      return
    }
    setLoading(true)
    try {
      const res = await createFamilyGroup(plate)
      if (!res.success) {
        showAlert('Erro', res.error ?? 'Não foi possível criar o grupo.', 'error')
        return
      }
      setNewGroupPlate('')
      setShowAddGroupForm(false)
      await reload()
    } finally {
      setLoading(false)
    }
  }

  const handleAddMember = async () => {
    if (!newMemberForm) return
    if (!newMemberForm.name.trim() || !newMemberForm.cpf.trim()) {
      showAlert('Atenção', 'Preencha nome e CPF do membro.', 'error')
      return
    }
    if (unmask(newMemberForm.cpf).length !== 11) {
      showAlert('Atenção', 'CPF deve ter 11 dígitos.', 'error')
      return
    }
    setLoading(true)
    try {
      const res = await addFamilyMember(newMemberForm.groupId, newMemberForm.name.trim(), newMemberForm.cpf.trim())
      if (!res.success) {
        showAlert('Erro', res.error ?? 'Não foi possível adicionar membro.', 'error')
        return
      }
      setNewMemberForm(null)
      await reload()
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateMember = async () => {
    if (!editingMember) return
    if (!editingMember.name.trim() || !editingMember.cpf.trim()) {
      showAlert('Atenção', 'Preencha nome e CPF.', 'error')
      return
    }
    if (unmask(editingMember.cpf).length !== 11) {
      showAlert('Atenção', 'CPF deve ter 11 dígitos.', 'error')
      return
    }
    setLoading(true)
    try {
      const res = await updateFamilyMember(editingMember.id, editingMember.name.trim(), editingMember.cpf.trim())
      if (!res.success) {
        showAlert('Erro', res.error ?? 'Não foi possível atualizar membro.', 'error')
        return
      }
      setEditingMember(null)
      await reload()
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteMember = (memberId: number) => {
    showConfirm('Remover membro', 'Remover este membro do grupo familiar?', async () => {
      setLoading(true)
      try {
        const res = await deleteFamilyMember(memberId)
        if (!res.success) {
          showAlert('Não é possível remover', res.error ?? 'Erro inesperado.', 'error')
          return
        }
        await reload()
      } finally {
        setLoading(false)
      }
    })
  }

  const handleDeleteGroup = (groupId: number) => {
    showConfirm('Excluir grupo', 'Excluir este grupo familiar e todos os seus membros?', async () => {
      setLoading(true)
      try {
        const res = await deleteFamilyGroup(groupId)
        if (!res.success) {
          showAlert('Erro', res.error ?? 'Não foi possível excluir o grupo.', 'error')
          return
        }
        await reload()
      } finally {
        setLoading(false)
      }
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Grupos Familiares</h1>

        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Buscar por placa..."
            value={maskPlate(searchPlate)}
            onChange={(e) => setSearchPlate(plateToRaw(e.target.value))}
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
          />
          <button
            onClick={() => setShowAddGroupForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
          >
            + Novo Grupo
          </button>
        </div>

        {showAddGroupForm && (
          <div className="bg-gray-800 rounded-lg p-4 mb-4 border border-gray-700">
            <p className="text-gray-300 text-sm mb-3 font-medium">Nova placa de grupo familiar</p>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Placa (ex: ABC-1234)"
                value={maskPlate(newGroupPlate)}
                onChange={(e) => setNewGroupPlate(plateToRaw(e.target.value))}
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                maxLength={8}
              />
              <button
                onClick={handleCreateGroup}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded transition-colors"
              >
                Criar
              </button>
              <button
                onClick={() => { setShowAddGroupForm(false); setNewGroupPlate('') }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <p className="text-gray-500 text-center py-12">
            {groups.length === 0 ? 'Nenhum grupo familiar cadastrado.' : 'Nenhum grupo encontrado para esta placa.'}
          </p>
        )}

        <div className="space-y-4">
          {filtered.map((group) => (
            <div key={group.id} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <span className="text-white font-semibold text-lg">{maskPlate(group.plate)}</span>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
                  disabled={loading}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  Excluir grupo
                </button>
              </div>

              <div className="divide-y divide-gray-700">
                {group.members.map((m) => (
                  <div key={m.id} className="px-4 py-3">
                    {editingMember?.id === m.id ? (
                      <div className="flex gap-2 flex-wrap">
                        <input
                          type="text"
                          value={editingMember.name}
                          onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                          placeholder="Nome"
                          className="flex-1 min-w-[120px] px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                          type="text"
                          value={maskCPF(editingMember.cpf)}
                          onChange={(e) => setEditingMember({ ...editingMember, cpf: maskCPF(e.target.value) })}
                          placeholder="CPF"
                          maxLength={14}
                          className="w-40 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          onClick={handleUpdateMember}
                          disabled={loading}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditingMember(null)}
                          className="px-3 py-1 text-gray-400 hover:text-white text-sm transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <span className="text-white flex-1">{m.name}</span>
                        <span className="text-gray-400 text-sm font-mono">{maskCPF(m.cpf)}</span>
                        <button
                          onClick={() => setEditingMember({ id: m.id, name: m.name, cpf: m.cpf })}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteMember(m.id)}
                          disabled={loading}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                        >
                          Remover
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                <div className="px-4 py-3">
                  {newMemberForm?.groupId === group.id ? (
                    <div className="flex gap-2 flex-wrap">
                      <input
                        type="text"
                        value={newMemberForm.name}
                        onChange={(e) => setNewMemberForm({ ...newMemberForm, name: e.target.value })}
                        placeholder="Nome completo"
                        className="flex-1 min-w-[120px] px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        value={maskCPF(newMemberForm.cpf)}
                        onChange={(e) => setNewMemberForm({ ...newMemberForm, cpf: maskCPF(e.target.value) })}
                        placeholder="CPF (123.456.789-00)"
                        maxLength={14}
                        className="w-44 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleAddMember}
                        disabled={loading}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
                      >
                        Adicionar
                      </button>
                      <button
                        onClick={() => setNewMemberForm(null)}
                        className="px-3 py-1 text-gray-400 hover:text-white text-sm transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setNewMemberForm({ groupId: group.id, name: '', cpf: '' })}
                      className="text-sm text-green-400 hover:text-green-300 transition-colors"
                    >
                      + Adicionar membro
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
