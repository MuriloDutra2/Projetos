import { useEffect } from 'react'
import type { View } from '../types/domain'

interface GlobalShortcutsOptions {
  view: View
  onCtrlN?: () => void
}

export function useGlobalShortcuts({ view, onCtrlN }: GlobalShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.key === 'n' || e.key === 'N') && (e.ctrlKey || e.metaKey)) {
        if (view === 'mensalistas' && onCtrlN) {
          e.preventDefault()
          onCtrlN()
        }
      }
      // Escape é tratado localmente por cada modal/view (RESEARCH.md Open Question 2)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, onCtrlN])
}
