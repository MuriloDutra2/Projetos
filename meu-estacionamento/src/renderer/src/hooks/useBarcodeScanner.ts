import { useCallback, useEffect, useRef } from 'react'

/** Tempo de espera após último caractere para considerar leitura completa (bipe sem Enter) */
const BARCODE_IDLE_MS = 120

/** Placa válida tem 7 caracteres alfanuméricos */
function isValidPlateLength(value: string): boolean {
  const raw = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return raw.length >= 7
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function useBarcodeScanner(onScan: (value: string) => void, enabled = true): void {
  const bufferRef = useRef('')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = useCallback(() => {
    bufferRef.current = ''
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const tryFlush = useCallback(() => {
    const value = bufferRef.current.trim()
    reset()
    if (value.length >= 7) {
      const raw = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7)
      if (raw.length === 7) onScan(raw)
    }
  }, [onScan, reset])

  useEffect(() => {
    if (!enabled) {
      reset()
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return

      if (e.key === 'Enter') {
        const hadValue = bufferRef.current.trim().length >= 7
        tryFlush()
        if (hadValue) e.preventDefault()
        return
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        bufferRef.current += e.key
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          if (isValidPlateLength(bufferRef.current)) {
            tryFlush()
          } else {
            reset()
          }
        }, BARCODE_IDLE_MS)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      reset()
    }
  }, [enabled, onScan, reset, tryFlush])
}

