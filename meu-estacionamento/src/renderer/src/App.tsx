import { useState, useRef, useCallback } from 'react'
import { clsx } from 'clsx'
import type { View } from './types/domain'
import Inicio from './views/Inicio'
import Excluidos from './views/Excluidos'
import Configuracoes from './views/Configuracoes'
import Historico from './views/Historico'
import Relatorio from './views/Relatorio'
import Financeiro from './views/Financeiro'
import Mensalistas, { type MensalistasHandle } from './views/Mensalistas'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'


function App(): React.JSX.Element {
  const [view, setView] = useState<View>('inicio')
  const mensalistasRef = useRef<MensalistasHandle>(null)

  const handleCtrlN = useCallback(() => {
    mensalistasRef.current?.openNewClientModal()
  }, []) // mensalistasRef is a stable ref object

  useGlobalShortcuts({
    view,
    onCtrlN: handleCtrlN
  })

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex">
      <aside className="w-16 bg-gray-800 border-r border-gray-700 flex flex-col items-center py-4 gap-2">
        <button
          type="button"
          onClick={() => setView('inicio')}
          className={clsx(
            'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
            view === 'inicio' ? 'bg-red-600/80 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
          )}
          title="Início"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setView('historico')}
          className={clsx(
            'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
            view === 'historico' ? 'bg-red-600/80 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
          )}
          title="Histórico"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setView('relatorio')}
          className={clsx(
            'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
            view === 'relatorio' ? 'bg-red-600/80 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
          )}
          title="Relatório do dia"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.5a2 2 0 012 2v5a2 2 0 01-2 2zm-3-7h.01M17 16h.01" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setView('mensalistas')}
          className={clsx(
            'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
            view === 'mensalistas' ? 'bg-red-600/80 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
          )}
          title="Mensalistas"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setView('financeiro')}
          className={clsx(
            'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
            view === 'financeiro' ? 'bg-red-600/80 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
          )}
          title="Financeiro"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setView('excluidos')}
          className={clsx(
            'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
            view === 'excluidos' ? 'bg-red-600/80 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
          )}
          title="Veículos excluídos"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setView('configuracoes')}
          className={clsx(
            'w-12 h-12 rounded-lg flex items-center justify-center transition-colors',
            view === 'configuracoes' ? 'bg-red-600/80 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
          )}
          title="Configurações"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </aside>

      {view === 'inicio' && <Inicio setView={setView} />}
      {view === 'historico' && <Historico />}
      {view === 'relatorio' && <Relatorio />}
      {view === 'mensalistas' && <Mensalistas ref={mensalistasRef} />}
      {view === 'financeiro' && <Financeiro />}
      {view === 'excluidos' && <Excluidos />}
      {view === 'configuracoes' && <Configuracoes />}
    </div>
  )
}

export default App
