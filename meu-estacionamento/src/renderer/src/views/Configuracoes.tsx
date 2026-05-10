import { useState, useEffect } from 'react'
import { getPrinters, getPrinterConfig, savePrinterConfig } from '../services/printer'
import { useDialog } from '../providers/DialogProvider'

export default function Configuracoes(): React.JSX.Element {
  const { showAlert } = useDialog()
  const [printers, setPrinters] = useState<{ name: string; displayName: string }[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState('')

  useEffect(() => {
    getPrinters().then(setPrinters).catch(console.error)
    getPrinterConfig().then(setSelectedPrinter).catch(console.error)
  }, [])

  const handleSave = async (): Promise<void> => {
    await savePrinterConfig(selectedPrinter)
    showAlert('Salvo', 'Configuração de impressora atualizada.', 'success')
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-xl font-bold mb-6 text-white">Configurações</h2>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md">
        <h3 className="text-lg font-medium text-white mb-4">Impressora</h3>
        <p className="text-sm text-gray-400 mb-4">
          Selecione a impressora térmica para tickets e recibos. Se não selecionar, será usada a impressora padrão do sistema.
        </p>
        <select
          value={selectedPrinter}
          onChange={(e) => setSelectedPrinter(e.target.value)}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white mb-4"
        >
          <option value="">Impressora padrão do sistema</option>
          {printers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.displayName || p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium text-white"
        >
          Salvar
        </button>
      </div>
    </div>
  )
}
