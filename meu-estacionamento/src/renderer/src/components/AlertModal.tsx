import { clsx } from 'clsx'

interface AlertModalProps {
  isOpen: boolean
  title: string
  message: string
  type: 'error' | 'success'
  onClose: () => void
  confirmMode?: boolean
  onConfirm?: () => void
  confirmLabel?: string
}

export default function AlertModal({
  isOpen,
  title,
  message,
  type,
  onClose,
  confirmMode = false,
  onConfirm,
  confirmLabel = 'Confirmar'
}: AlertModalProps): React.JSX.Element | null {
  if (!isOpen) return null

  const isError = type === 'error'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={clsx(
          'bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4 border-2 overflow-hidden',
          isError ? 'border-red-500' : 'border-blue-500'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
        </div>
        <div className="p-4 flex gap-3 justify-end bg-slate-800/80">
          {confirmMode && onConfirm ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm()
                  onClose()
                }}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors"
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={clsx(
                'px-8 py-3 font-semibold rounded-lg transition-colors',
                isError
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              )}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
