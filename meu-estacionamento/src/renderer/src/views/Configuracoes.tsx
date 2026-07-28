import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import {
  getPrinters,
  getPrinterConfig,
  savePrinterConfig,
  getPrintingEnabled,
  setPrintingEnabled
} from '../services/printer'
import { useDialog } from '../providers/DialogProvider'

export default function Configuracoes(): React.JSX.Element {
  const { showAlert } = useDialog()
  const [printers, setPrinters] = useState<{ name: string; displayName: string }[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [printingOn, setPrintingOn] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getPrintingEnabled()
      .then((on) => {
        setPrintingOn(on)
        // Só consulta as impressoras do Windows se a impressão estiver ligada.
        if (on) getPrinters().then(setPrinters).catch(console.error)
      })
      .catch(console.error)
    getPrinterConfig().then(setSelectedPrinter).catch(console.error)
  }, [])

  const handleTogglePrinting = async (ligar: boolean): Promise<void> => {
    setSaving(true)
    try {
      await setPrintingEnabled(ligar)
      setPrintingOn(ligar)
      if (ligar) {
        getPrinters().then(setPrinters).catch(console.error)
        showAlert('Impressora ligada', 'O sistema voltará a imprimir tickets e recibos.', 'success')
      } else {
        setPrinters([])
        showAlert(
          'Impressora desligada',
          'O sistema não vai mais imprimir nem procurar a impressora. Tudo continua sendo registrado normalmente.',
          'success'
        )
      }
    } catch (e) {
      console.error(e)
      showAlert('Erro', 'Não foi possível salvar. Tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    await savePrinterConfig(selectedPrinter)
    showAlert('Salvo', 'Configuração de impressora atualizada.', 'success')
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-xl font-bold mb-6 text-white">Configurações</h2>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md">
        <h3 className="text-lg font-medium text-white mb-4">Impressora</h3>

        <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-gray-700">
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Usar impressora térmica</p>
            <p className="text-xs text-gray-400 mt-1">
              Desligue se o estacionamento não estiver usando a impressora. Assim o sistema para
              de procurá-la no Windows — é isso que deixava o app travado ao registrar entrada.
              Nada muda no registro de veículos, valores ou caixa.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={printingOn}
            disabled={saving}
            onClick={() => handleTogglePrinting(!printingOn)}
            className={clsx(
              'relative w-14 h-8 rounded-full transition-colors shrink-0 disabled:opacity-50',
              printingOn ? 'bg-green-600' : 'bg-gray-600'
            )}
          >
            <span
              className={clsx(
                'absolute top-1 w-6 h-6 bg-white rounded-full transition-all',
                printingOn ? 'left-7' : 'left-1'
              )}
            />
          </button>
        </div>

        {printingOn ? (
          <>
            <p className="text-sm text-gray-400 mb-4">
              Selecione a impressora térmica para tickets e recibos. Se não selecionar, será usada
              a impressora padrão do sistema.
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
          </>
        ) : (
          <p className="text-sm text-amber-400/90 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2">
            Impressão desligada. Tickets e recibos não serão impressos, e o sistema não procura a
            impressora. Ligue de volta quando a impressora estiver conectada.
          </p>
        )}
      </div>
    </div>
  )
}
