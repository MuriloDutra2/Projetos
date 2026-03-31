import { useCallback, useEffect, useRef } from 'react'

/** Tempo de espera após último caractere para considerar leitura completa (bipe sem Enter) */
const BARCODE_IDLE_MS = 120

/** Janela de tempo (ms) em que vários caracteres são considerados leitura de bipe (não digitação) */
const BARCODE_BURST_MS = 150

/** Mínimo de caracteres para considerar leitura válida (permite "TESTE" e placas de 7 chars) */
const MIN_PLATE_LENGTH = 5

function isValidPlateLength(value: string): boolean {
  const raw = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return raw.length >= MIN_PLATE_LENGTH
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
  const firstKeyTimeRef = useRef<number>(0)
  const burstDetectedRef = useRef(false)

  const reset = useCallback(() => {
    bufferRef.current = ''
    firstKeyTimeRef.current = 0
    burstDetectedRef.current = false
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const tryFlush = useCallback(() => {
    const value = bufferRef.current.trim()
    reset()
    if (value.length >= MIN_PLATE_LENGTH) {
      const raw = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7)
      if (raw.length >= MIN_PLATE_LENGTH) onScan(raw)
    }
  }, [onScan, reset])

  useEffect(() => {
    if (!enabled) {
      reset()
      return
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = isEditableTarget(e.target)

      if (e.key === 'Enter') {
        const hadValue = bufferRef.current.trim().length >= MIN_PLATE_LENGTH
        tryFlush()
        if (hadValue) e.preventDefault()
        return
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const now = Date.now()
        if (bufferRef.current.length === 0) firstKeyTimeRef.current = now
        bufferRef.current += e.key

        const elapsed = now - firstKeyTimeRef.current
        if (bufferRef.current.length >= 4 && elapsed < BARCODE_BURST_MS) {
          burstDetectedRef.current = true
          if (isInput) e.preventDefault()
        }

        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          if (isValidPlateLength(bufferRef.current) && burstDetectedRef.current) {
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

