import { createContext, useCallback, useContext, useState } from 'react'
import AlertModal from '../components/AlertModal'

interface DialogContextValue {
  showAlert: (title: string, message: string, type: 'error' | 'success') => void
  showConfirm: (title: string, message: string, onConfirm: () => Promise<void> | void) => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used within DialogProvider')
  return ctx
}

export default function DialogProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [alertState, setAlertState] = useState<{
    open: boolean
    title: string
    message: string
    type: 'error' | 'success'
  }>({ open: false, title: '', message: '', type: 'error' })

  const [confirmState, setConfirmState] = useState<{
    open: boolean
    title: string
    message: string
    onConfirm: () => Promise<void> | void
  }>({ open: false, title: '', message: '', onConfirm: () => {} })

  const showAlert = useCallback((title: string, message: string, type: 'error' | 'success'): void => {
    setAlertState({ open: true, title, message, type })
  }, [])

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => Promise<void> | void): void => {
    setConfirmState({ open: true, title, message, onConfirm })
  }, [])

  const handleConfirm = async (): Promise<void> => {
    try {
      await confirmState.onConfirm()
    } catch (err) {
      console.error('Confirm callback threw:', err)
      showAlert('Erro', 'Ocorreu um erro inesperado. Tente novamente.', 'error')
    } finally {
      setConfirmState((s) => ({ ...s, open: false }))
    }
  }

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AlertModal
        isOpen={alertState.open}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        onClose={() => setAlertState((s) => ({ ...s, open: false }))}
      />
      <AlertModal
        isOpen={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        type="error"
        onClose={() => setConfirmState((s) => ({ ...s, open: false }))}
        confirmMode
        onConfirm={() => { void handleConfirm() }}
        confirmLabel="Confirmar"
      />
    </DialogContext.Provider>
  )
}
