import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { clsx } from 'clsx'
import {
  getShiftOverview,
  closeShift,
  printShiftClosure,
  type ShiftOverview,
  type ShiftClosure
} from '../services/shifts'
import { useDialog } from '../providers/DialogProvider'
import { friendlyError } from '../utils/errorHandler'
import { maskCurrency, parseCurrencyToNumber, formatBRL as money } from '../utils/masks'
import { mergeTransactions } from '../utils/transactions'

function closurePeriodLabel(c: ShiftClosure): string {
  return `${format(new Date(c.start_iso), 'dd/MM HH:mm')} – ${format(new Date(c.end_iso), 'dd/MM HH:mm')}`
}

function closureToPrintData(c: ShiftClosure): Parameters<typeof printShiftClosure>[0] {
  const byMethod = (JSON.parse(c.by_method_json || '[]') as { method: string; total: number }[]).map(
    (m) => ({ method: m.method, total: m.total })
  )
  return {
    shiftLabel: c.shift_type === 'DIURNO' ? 'Turno diurno' : 'Turno noturno',
    periodLabel: closurePeriodLabel(c),
    totalAvulsos: c.total_avulsos,
    countAvulsos: c.count_avulsos,
    totalRenovacoes: c.total_renovacoes,
    countRenovacoes: c.count_renovacoes,
    byMethod,
    cashExpected: c.cash_expected,
    cashCounted: c.cash_counted,
    cashDifference: c.cash_difference,
    operatorName: c.operator_name,
    closedAtLabel: format(new Date(c.closed_at), 'dd/MM/yyyy HH:mm')
  }
}

export default function FechamentoCaixa(): React.JSX.Element {
  const { showAlert, showConfirm } = useDialog()
  const [overview, setOverview] = useState<ShiftOverview | null>(null)
  const [now, setNow] = useState<Date>(new Date())
  const [cashCountedStr, setCashCountedStr] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [closing, setClosing] = useState(false)

  const reload = useCallback(() => {
    getShiftOverview().then(setOverview).catch(console.error)
  }, [])

  useEffect(() => {
    reload()
    const t = setInterval(() => {
      setNow(new Date())
      reload()
    }, 30000)
    return () => clearInterval(t)
  }, [reload])

  const live = overview?.live ?? null
  const lastClosure = overview?.closures?.[0] ?? null

  const countdown = useMemo(() => {
    if (!overview) return ''
    const ms = new Date(overview.shift.endIso).getTime() - now.getTime()
    if (ms <= 0) return 'Horário do turno encerrado — feche o caixa'
    const totalMin = Math.floor(ms / 60000)
    const h = Math.floor(totalMin / 60)
    const min = totalMin % 60
    return h > 0 ? `Fecha em ${h}h ${min}min` : `Fecha em ${min}min`
  }, [overview, now])

  const cashCounted = parseCurrencyToNumber(cashCountedStr)
  const hasCashInput = cashCountedStr.trim().length > 0
  const cashDiff = hasCashInput && live ? cashCounted - live.cashExpected : null

  const transactions = useMemo(
    () => (live ? mergeTransactions(live.tickets, live.payments) : []),
    [live]
  )

  const handleClose = (): void => {
    if (!overview || overview.alreadyClosed) return
    const resumo = live
      ? `Total do turno: ${money(live.total)}.` +
        (hasCashInput
          ? ` Dinheiro contado: ${money(cashCounted)} (esperado ${money(live.cashExpected)}).`
          : ' Sem conferência de dinheiro.')
      : ''
    showConfirm(
      'Fechar turno',
      `${resumo} Depois de fechado, o turno não muda mais. Confirmar?`,
      async () => {
        setClosing(true)
        try {
          const res = await closeShift({
            cashCounted: hasCashInput ? cashCounted : null,
            operatorName: operatorName.trim() || undefined
          })
          if (res.success && res.closure) {
            setCashCountedStr('')
            setOperatorName('')
            reload()
            showAlert('Turno fechado', 'Fechamento registrado. Imprimindo comprovante...', 'success')
            const printRes = await printShiftClosure(closureToPrintData(res.closure))
            if (!printRes.success) {
              showAlert('Erro de impressão', friendlyError(printRes.error ?? 'printer'), 'error')
            }
          } else {
            showAlert('Erro', friendlyError(res.error ?? 'Erro ao fechar turno'), 'error')
          }
        } catch (err) {
          console.error(err)
          showAlert('Erro', friendlyError(err), 'error')
        } finally {
          setClosing(false)
        }
      }
    )
  }

  if (!overview) {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <h2 className="text-xl font-bold text-white">Fechamento de caixa</h2>
        <p className="text-gray-500 mt-4">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Fechamento de caixa</h2>
          <p className="text-xs text-gray-400 mt-1">{format(now, 'dd/MM/yyyy HH:mm')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border',
              overview.shift.shiftType === 'DIURNO'
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                : 'bg-blue-500/15 text-blue-300 border-blue-500/40'
            )}
          >
            {overview.shift.label}
          </span>
          <span className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
            {countdown}
          </span>
        </div>
      </div>

      {overview.alreadyClosed && lastClosure ? (
        <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-4 mb-6">
          <p className="text-green-300 font-medium">
            Este turno já foi fechado às {format(new Date(lastClosure.closed_at), 'HH:mm')}
            {lastClosure.operator_name ? ` por ${lastClosure.operator_name}` : ''}.
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Total fechado: {money(lastClosure.total_avulsos + lastClosure.total_renovacoes)}. Novas
            transações entram no próximo turno.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Avulsos no turno</p>
              <p className="text-2xl font-bold text-white">{money(live?.totalAvulsos ?? 0)}</p>
              <p className="text-xs text-gray-500 mt-1">{live?.countAvulsos ?? 0} saídas</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Renovações no turno</p>
              <p className="text-2xl font-bold text-green-500">{money(live?.totalRenovacoes ?? 0)}</p>
              <p className="text-xs text-gray-500 mt-1">{live?.countRenovacoes ?? 0} vendas</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Total do turno</p>
              <p className="text-2xl font-bold text-green-500">{money(live?.total ?? 0)}</p>
              <p className="text-xs text-gray-500 mt-1">
                Desde {format(new Date(overview.windowStartIso), 'dd/MM HH:mm')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-300 mb-2">Por forma de pagamento</p>
              {live && live.byMethod.length > 0 ? (
                <table className="w-full text-sm">
                  <tbody>
                    {live.byMethod.map((m) => (
                      <tr key={m.method}>
                        <td className="py-1 text-gray-400">{m.method}</td>
                        <td className="py-1 text-right text-white font-medium">{money(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-gray-500">Nenhum pagamento no turno.</p>
              )}
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm font-semibold text-gray-300 mb-2">Conferência do caixa</p>
              <label className="block text-xs text-gray-400 mb-1">
                Dinheiro contado na gaveta (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={cashCountedStr}
                onChange={(e) => setCashCountedStr(maskCurrency(e.target.value))}
                placeholder="0,00"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 mb-2"
              />
              <label className="block text-xs text-gray-400 mb-1">Operador (opcional)</label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Nome de quem fecha"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 mb-2"
              />
              {live && (
                <p className="text-xs text-gray-400">
                  Dinheiro esperado: <span className="text-white">{money(live.cashExpected)}</span>
                  {cashDiff != null && (
                    <>
                      {' · '}
                      <span
                        className={clsx(
                          'font-semibold',
                          cashDiff === 0 ? 'text-green-400' : cashDiff > 0 ? 'text-amber-400' : 'text-red-400'
                        )}
                      >
                        {cashDiff === 0
                          ? 'Confere'
                          : cashDiff > 0
                            ? `Sobra de ${money(cashDiff)}`
                            : `Falta de ${money(Math.abs(cashDiff))}`}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-6">
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold text-white"
            >
              {closing ? 'Fechando...' : 'Fechar turno'}
            </button>
            <p className="text-xs text-gray-500">
              Depois de fechado, o turno não muda mais — vira registro histórico.
            </p>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-700/50">
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Hora</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Tipo</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Descrição</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        Nenhuma transação no turno
                      </td>
                    </tr>
                  ) : (
                    transactions.map((t, i) => (
                      <tr key={`${t.type}-${t.date}-${i}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-gray-300">{format(new Date(t.date), 'dd/MM HH:mm')}</td>
                        <td className="px-4 py-3">
                          <span
                            className={clsx(
                              'px-2 py-1 rounded text-xs font-medium',
                              t.type === 'renovacao' ? 'bg-green-900/60 text-green-300' : 'bg-gray-600 text-gray-200'
                            )}
                          >
                            {t.type === 'renovacao' ? 'Renovação' : 'Avulso'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white">{t.description}</td>
                        <td className="px-4 py-3 text-right font-medium text-white">{money(t.value)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-300">Fechamentos anteriores</p>
        {lastClosure && (
          <button
            type="button"
            onClick={async () => {
              const res = await printShiftClosure(closureToPrintData(lastClosure))
              if (!res.success) showAlert('Erro de impressão', friendlyError(res.error ?? 'printer'), 'error')
            }}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium text-white"
          >
            Imprimir último fechamento
          </button>
        )}
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <tbody>
              {overview.closures.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-500">Nenhum fechamento registrado ainda</td>
                </tr>
              ) : (
                overview.closures.map((c) => (
                  <tr key={c.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-gray-300 text-sm whitespace-nowrap">
                      {c.shift_type === 'DIURNO' ? '☀' : '☾'}{' '}
                      {format(new Date(c.start_iso), 'dd/MM')} · {closurePeriodLabel(c).slice(6)}
                    </td>
                    <td className="px-4 py-3 text-white font-medium text-sm whitespace-nowrap">
                      {money(c.total_avulsos + c.total_renovacoes)}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {c.cash_difference == null ? (
                        <span className="text-gray-500">Sem conferência</span>
                      ) : c.cash_difference === 0 ? (
                        <span className="text-green-400">Confere</span>
                      ) : c.cash_difference > 0 ? (
                        <span className="text-amber-400">Sobra {money(c.cash_difference)}</span>
                      ) : (
                        <span className="text-red-400">Falta {money(Math.abs(c.cash_difference))}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm whitespace-nowrap">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-green-900/60 text-green-300">
                        Fechado{c.operator_name ? ` · ${c.operator_name}` : ''}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
