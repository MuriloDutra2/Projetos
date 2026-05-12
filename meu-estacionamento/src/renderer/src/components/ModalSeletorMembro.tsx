import { useState, useEffect, useRef } from 'react'
import { maskPlate } from '../utils/masks'

interface FamilyMember {
  id: number
  name: string
  cpf: string
}

interface Props {
  plate: string
  members: FamilyMember[]
  onSelect: (member: FamilyMember) => void
  onCancel: () => void
}

export default function ModalSeletorMembro({ plate, members, onSelect, onCancel }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = members.find((m) => m.id === selectedId) ?? null

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key === 'Enter' && selected) {
      e.preventDefault()
      onSelect(selected)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 outline-none"
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-gray-800 rounded-lg p-6 w-80 shadow-xl">
        <h2 className="text-white text-lg font-semibold mb-1">Placa {maskPlate(plate)}</h2>
        <p className="text-gray-400 text-sm mb-4">Quem está chegando?</p>

        <div className="space-y-2 mb-6">
          {members.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-700 transition-colors"
            >
              <input
                type="radio"
                name="membro"
                value={m.id}
                checked={selectedId === m.id}
                onChange={() => setSelectedId(m.id)}
                className="accent-blue-500"
              />
              <span className="text-white">{m.name}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => selected && onSelect(selected)}
            disabled={!selectedId}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
