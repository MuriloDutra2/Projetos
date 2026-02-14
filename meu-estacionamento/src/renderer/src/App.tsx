import { useState, useEffect } from 'react'
import { format, differenceInMinutes, isToday, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'
import { clsx } from 'clsx'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** Formata placas para exibição: "PLACA1, PLACA2 (+X)" com tooltip completo */
function formatPlatesDisplay(plates: string[]): { text: string; title: string } {
  const list = plates ?? []
  if (list.length === 0) return { text: '-', title: '' }
  const formatted = list.map((p) => maskPlate(p))
  const fullList = formatted.join(', ')
  if (list.length <= 2) return { text: fullList, title: fullList }
  const visible = formatted.slice(0, 2).join(', ')
  const extra = list.length - 2
  return { text: `${visible} (+${extra})`, title: fullList }
}
import logoImg from './assets/logo.png'
import ModalCheckout from './components/ModalCheckout'
import ModalNovoCliente, { type ClientToEdit } from './components/ModalNovoCliente'
import ModalRenovar from './components/ModalRenovar'
import AlertModal from './components/AlertModal'
import { maskPlate, plateToRaw } from './utils/masks'
import { friendlyError } from './utils/errorHandler'

interface Ticket {
  id: number
  placa: string
  tipo: string
  entrada: string
  status: string
}

interface HistoryEntry {
  id: number
  placa: string
  tipo: string
  entrada: string
  saida: string
  valor: number
}

interface ClientRow {
  id: number
  name: string
  cpf?: string
  phone?: string
  plan_type: string
  expiry_date: string
  status: string
  plates: string[]
  isExpired: boolean
}

interface SubscriptionInfo {
  isSubscriber: boolean
  clientName: string
  planType: string
  isExpired: boolean
  expiryDate: string
  freeMinutes: number
}

type View = 'inicio' | 'historico' | 'mensalistas' | 'financeiro' | 'configuracoes'

function planLabel(planType: string): string {
  if (planType === 'MENSAL_CARRO') return 'Mensal Carro'
  if (planType === 'MENSAL_MOTO') return 'Mensal Moto'
  if (planType === 'FUNCIONARIO') return 'Funcionário'
  return planType
}

function App(): React.JSX.Element {
  const [placa, setPlaca] = useState('')
  const [tipo, setTipo] = useState<'Carro' | 'Moto'>('Carro')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [financialHistory, setFinancialHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<View>('inicio')
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [checkoutTicket, setCheckoutTicket] = useState<Ticket | null>(null)
  const [checkoutValor, setCheckoutValor] = useState(0)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const [modalNovoClienteOpen, setModalNovoClienteOpen] = useState(false)
  const [clientToEdit, setClientToEdit] = useState<ClientToEdit | null>(null)
  const [printers, setPrinters] = useState<{ name: string; displayName: string }[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [financeFilterMonth, setFinanceFilterMonth] = useState(() => new Date().getMonth() + 1)
  const [financeFilterYear, setFinanceFilterYear] = useState(() => new Date().getFullYear())
  const [modalRenovarOpen, setModalRenovarOpen] = useState(false)
  const [renovarClient, setRenovarClient] = useState<{
    clientId: number
    clientName: string
    planType: string
    clientCpf?: string
    clientPhone?: string
    clientPlates?: string[]
  } | null>(null)
  const [searchMensalistas, setSearchMensalistas] = useState('')
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
    onConfirm: () => void
  }>({ open: false, title: '', message: '', onConfirm: () => {} })

  useEffect(() => {
    loadTickets()
  }, [])

  useEffect(() => {
    if (view === 'historico') loadHistory()
    if (view === 'mensalistas') loadClients()
    if (view === 'financeiro') {
      loadHistory()
      loadFinancialHistory()
    }
    if (view === 'configuracoes') {
      window.api.getPrinters().then(setPrinters)
      window.api.getPrinterConfig().then(setSelectedPrinter)
    }
  }, [view])

  useEffect(() => {
    const t = setInterval(() => setTickets((p) => [...p]), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmState.open) setConfirmState((s) => ({ ...s, open: false }))
        else if (alertState.open) setAlertState((s) => ({ ...s, open: false }))
        else if (modalOpen && !checkoutLoading) {
          setModalOpen(false)
          setCheckoutTicket(null)
        } else if (modalNovoClienteOpen) {
          setModalNovoClienteOpen(false)
          setClientToEdit(null)
        } else if (renovarClient) {
          setModalRenovarOpen(false)
          setRenovarClient(null)
        }
      }
      if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (view === 'mensalistas') {
          setClientToEdit(null)
          setModalNovoClienteOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmState.open, alertState.open, modalOpen, modalNovoClienteOpen, renovarClient, view, checkoutLoading])

  const loadTickets = async () => {
    try {
      const data = await window.api.getTickets()
      setTickets(data)
    } catch (e) {
      console.error(e)
    }
  }

  const loadHistory = async () => {
    try {
      const data = await window.api.getHistory()
      setHistory(data)
    } catch (e) {
      console.error(e)
    }
  }

  const loadClients = async () => {
    try {
      const data = await window.api.getClients()
      setClients(data)
    } catch (e) {
      console.error(e)
    }
  }

  const loadFinancialHistory = async () => {
    try {
      const data = await window.api.getFinancialHistory()
      setFinancialHistory(data)
    } catch (e) {
      console.error(e)
    }
  }

  const handlePlacaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = plateToRaw(e.target.value)
    setPlaca(v)
    if (v.length < 5) setSubscriptionInfo(null)
  }

  const handlePlacaBlur = async () => {
    if (placa.length < 5) return
    try {
      const info = await window.api.checkPlateSubscription(placa)
      setSubscriptionInfo(info)
    } catch (e) {
      setSubscriptionInfo(null)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    handleRegisterEntry(e)
  }

  const handleCheckoutClick = async (ticket: Ticket) => {
    try {
      const res = await window.api.calculateValue({
        entrada: ticket.entrada,
        placa: ticket.placa,
        tipo: ticket.tipo
      })
      setCheckoutValor(res.valor)
    } catch {
      setCheckoutValor(0)
    }
    setCheckoutTicket(ticket)
    setModalOpen(true)
  }

  const handleCheckoutConfirm = async () => {
    if (!checkoutTicket) return
    setCheckoutLoading(true)
    try {
      const result = await window.api.checkoutTicket({ id: checkoutTicket.id })
      if (result.success) {
        try {
          const saida = new Date().toISOString()
          const minutos = differenceInMinutes(new Date(), new Date(checkoutTicket.entrada))
          const tempoTotal = minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)}h ${minutos % 60}min`
          const printRes = await window.electron.ipcRenderer.invoke('print-exit', {
            placa: checkoutTicket.placa,
            entrada: checkoutTicket.entrada,
            saida,
            valor: checkoutValor,
            tempoTotal
          })
          if (printRes && !printRes.success) {
            showAlert('Erro de impressão', friendlyError(printRes.error ?? 'printer'), 'error')
          }
        } catch (err) {
          console.error(err)
          showAlert('Erro de impressão', friendlyError(err), 'error')
        }
        setModalOpen(false)
        setCheckoutTicket(null)
        await loadTickets()
        if (view === 'historico') await loadHistory()
        if (view === 'financeiro') {
          await loadHistory()
          await loadFinancialHistory()
        }
      } else {
        showAlert('Erro', friendlyError(result.error ?? 'checkout'), 'error')
      }
    } catch (err) {
      console.error(err)
      showAlert('Erro', friendlyError(err), 'error')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const calcularTempoDecorrido = (entrada: string) =>
    differenceInMinutes(new Date(), new Date(entrada))

  const formatarTempo = (minutos: number) => {
    if (minutos < 60) return `${minutos} min`
    const h = Math.floor(minutos / 60)
    const m = minutos % 60
    return m > 0 ? `${h}h ${m}min` : `${h}h`
  }

  const historyToday = history.filter((h) => isToday(new Date(h.saida)))
  const veiculosHoje = historyToday.length
  const faturamentoHoje = historyToday.reduce((s, h) => s + (h.valor ?? 0), 0)

  const filterDate = new Date(financeFilterYear, financeFilterMonth - 1, 1)
  const monthStart = startOfMonth(filterDate)
  const monthEnd = endOfMonth(filterDate)
  const inMonth = (d: string) => isWithinInterval(new Date(d), { start: monthStart, end: monthEnd })
  const totalAvulsosMes = history
    .filter((h) => h.saida && inMonth(h.saida))
    .reduce((s, h) => s + (h.valor ?? 0), 0)
  const totalRenovacoesMes = financialHistory
    .filter((p) => inMonth(p.payment_date))
    .reduce((s, p) => s + (p.amount ?? 0), 0)

  const mixedTransactionsAll = [
    ...history
      .filter((h) => h.saida)
      .map((h) => ({
        date: h.saida,
        type: 'avulso' as const,
        description: `Ticket ${h.placa}`,
        value: h.valor ?? 0
      })),
    ...financialHistory.map((p) => ({
      date: p.payment_date,
      type: 'renovacao' as const,
      description: `Renovação - ${p.client_name}`,
      value: p.amount ?? 0
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const mixedTransactions = view === 'financeiro'
    ? mixedTransactionsAll.filter((t) => inMonth(t.date))
    : mixedTransactionsAll

  const showAlert = (title: string, message: string, type: 'error' | 'success') => {
    setAlertState({ open: true, title, message, type })
  }

  const handleRegisterEntry = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!placa.trim()) return
    const tipoToSave =
      subscriptionInfo?.isSubscriber && !subscriptionInfo?.isExpired
        ? 'MENSALISTA'
        : tipo
    setLoading(true)
    ;(async () => {
      try {
        const result = await window.api.createTicket({
          placa: placa.toUpperCase(),
          tipo: tipoToSave
        })
        if (result.success) {
          setPlaca('')
          setSubscriptionInfo(null)
          try {
            const printRes = await window.electron.ipcRenderer.invoke('print-entry', {
              id: result.id,
              placa: placa.toUpperCase(),
              entrada: result.entrada ?? new Date().toISOString()
            })
            if (printRes && !printRes.success) {
              showAlert('Erro de impressão', friendlyError(printRes.error ?? 'printer'), 'error')
            }
          } catch (err) {
            console.error(err)
            showAlert('Erro de impressão', friendlyError(err), 'error')
          }
          await loadTickets()
        } else {
          const msg = result.message || friendlyError(result.error) || 'Não foi possível registrar. Tente novamente.'
          showAlert(result.message ? 'Atenção' : 'Erro', msg, 'error')
          if (result.message !== 'Veículo já está no pátio!') {
            setPlaca('')
          }
        }
      } catch (err) {
        console.error(err)
        showAlert('Erro', friendlyError(err), 'error')
      } finally {
        setLoading(false)
      }
    })()
  }

  const openRenovar = (c: ClientRow) => {
    setRenovarClient({
      clientId: c.id,
      clientName: c.name,
      planType: c.plan_type,
      clientCpf: c.cpf,
      clientPhone: c.phone,
      clientPlates: c.plates ?? []
    })
    setModalRenovarOpen(true)
  }

  const searchLower = searchMensalistas.trim().toLowerCase()
  const searchDigits = searchLower.replace(/\D/g, '')
  const filteredClients =
    searchLower === ''
      ? clients
      : clients.filter((c) => {
          if (c.name.toLowerCase().includes(searchLower)) return true
          const cpfDigits = (c.cpf ?? '').replace(/\D/g, '')
          if (searchDigits.length >= 3 && cpfDigits.includes(searchDigits)) return true
          return (c.plates ?? []).some((p) => p.toLowerCase().includes(searchLower))
        })

  const openCancelConfirm = (c: ClientRow) => {
    setConfirmState({
      open: true,
      title: 'Cancelar plano',
      message: `Deseja cancelar o plano de ${c.name}? O cliente perderá o acesso imediato.`,
      onConfirm: async () => {
        const res = await window.api.toggleClientStatus({ clientId: c.id, active: 0 })
        if (res.success) loadClients()
        else showAlert('Erro', friendlyError(res.error ?? 'Não foi possível cancelar'), 'error')
      }
    })
  }

  const openEditarCliente = (c: ClientRow) => {
    setClientToEdit({
      id: c.id,
      name: c.name,
      cpf: c.cpf,
      phone: c.phone,
      plan_type: c.plan_type,
      expiry_date: c.expiry_date,
      plates: c.plates ?? []
    })
    setModalNovoClienteOpen(true)
  }

  const openReativarConfirm = (c: ClientRow) => {
    setConfirmState({
      open: true,
      title: 'Reativar cliente',
      message: `Deseja reativar o plano de ${c.name}?`,
      onConfirm: async () => {
        const res = await window.api.toggleClientStatus({ clientId: c.id, active: 1 })
        if (res.success) loadClients()
        else showAlert('Erro', friendlyError(res.error ?? 'Não foi possível reativar'), 'error')
      }
    })
  }

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

      {view === 'inicio' && (
        <>
          <div className="w-[30%] min-w-[280px] bg-gray-800 border-r border-gray-700 p-6 flex flex-col">
            <div className="mb-6 flex justify-center">
              <img src={logoImg} alt="KF Estacionamento" className="w-32 h-auto max-h-14 object-contain" />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="placa" className="block text-sm font-medium mb-2 text-gray-300">
                  Placa do Veículo
                </label>
                <input
                  id="placa"
                  type="text"
                  value={maskPlate(placa)}
                  onChange={handlePlacaChange}
                  onBlur={handlePlacaBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleRegisterEntry()
                    }
                  }}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-white uppercase placeholder-gray-500"
                  placeholder="ABC-1234"
                  maxLength={8}
                  required
                />
              </div>

              {subscriptionInfo?.isSubscriber && !subscriptionInfo?.isExpired && (
                <div className="p-3 rounded-lg bg-green-900/40 border border-green-600 text-green-200 text-sm">
                  MENSALISTA DETECTADO: {subscriptionInfo.clientName} — Até {subscriptionInfo.freeMinutes} min grátis
                </div>
              )}
              {subscriptionInfo?.isSubscriber && subscriptionInfo?.isExpired && (
                <div className="p-3 rounded-lg bg-amber-900/40 border border-amber-600 text-amber-200 text-sm">
                  PLANO VENCIDO EM {format(new Date(subscriptionInfo.expiryDate), 'dd/MM/yyyy')}! Cobrar como avulso?
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Tipo de Veículo</label>
                <div className="flex gap-2 p-1 bg-gray-700 rounded-lg w-fit">
                  <label
                    className={clsx(
                      'px-4 py-2 rounded-md cursor-pointer text-sm font-medium transition-all',
                      tipo === 'Carro' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-white'
                    )}
                  >
                    <input type="radio" value="Carro" checked={tipo === 'Carro'} onChange={() => setTipo('Carro')} className="sr-only" />
                    Carro
                  </label>
                  <label
                    className={clsx(
                      'px-4 py-2 rounded-md cursor-pointer text-sm font-medium transition-all',
                      tipo === 'Moto' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-white'
                    )}
                  >
                    <input type="radio" value="Moto" checked={tipo === 'Moto'} onChange={() => setTipo('Moto')} className="sr-only" />
                    Moto
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-bold text-lg transition-colors mt-4 text-white"
              >
                {loading ? 'REGISTRANDO...' : 'REGISTRAR ENTRADA'}
              </button>
            </form>

            <div className="mt-8 p-4 bg-gray-700 rounded-lg">
              <h2 className="text-sm font-semibold mb-2 text-gray-300">Regras de Cobrança</h2>
              <ul className="text-xs space-y-1 text-gray-400">
                <li>• 0 a 90 min (avulso): Grátis</li>
                <li>• Mensalista: 2h30 ou 12h (func.) grátis</li>
                <li>• Hora extra: R$ 4,00</li>
              </ul>
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 text-white">Veículos Estacionados</h2>
            {tickets.length === 0 ? (
              <div className="text-center text-gray-400 mt-20">
                <p className="text-lg">Nenhum veículo estacionado</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tickets.map((ticket) => {
                  const tempoDecorrido = calcularTempoDecorrido(ticket.entrada)
                  const freeMin = ticket.tipo === 'MENSALISTA' ? 150 : 90
                  const isAlerta = tempoDecorrido > freeMin
                  return (
                    <div
                      key={ticket.id}
                      className={clsx(
                        'p-4 rounded-lg border-2 transition-all',
                        isAlerta ? 'bg-red-900/30 border-red-500' : 'bg-gray-800 border-gray-700'
                      )}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="text-2xl font-bold text-white">{ticket.placa}</div>
                          <div className="text-sm text-gray-400">{ticket.tipo}</div>
                        </div>
                        {isAlerta && (
                          <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">ALERTA</span>
                        )}
                      </div>
                      <div className="space-y-2 mb-4">
                        <div className="text-sm">
                          <span className="text-gray-400">Entrada: </span>
                          <span className="font-medium text-white">{format(new Date(ticket.entrada), 'HH:mm')}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-400">Tempo: </span>
                          <span className={clsx('font-bold', isAlerta ? 'text-red-400' : 'text-green-400')}>
                            {formatarTempo(tempoDecorrido)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCheckoutClick(ticket)}
                        className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold text-white"
                      >
                        SAÍDA
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'historico' && (
        <div className="flex-1 p-6 overflow-y-auto">
          <h2 className="text-xl font-bold mb-6 text-white">Histórico e Faturamento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Veículos Hoje</p>
              <p className="text-2xl font-bold text-white">{veiculosHoje}</p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Faturamento Hoje (R$)</p>
              <p className="text-2xl font-bold text-green-500">{faturamentoHoje.toFixed(2).replace('.', ',')}</p>
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-700/50">
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Placa</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Entrada</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Saída</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">Nenhum registro finalizado</td>
                    </tr>
                  ) : (
                    history.map((h) => (
                      <tr key={h.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="px-4 py-3 font-medium text-white">{h.placa}</td>
                        <td className="px-4 py-3 text-gray-300">{format(new Date(h.entrada), 'dd/MM HH:mm')}</td>
                        <td className="px-4 py-3 text-gray-300">{h.saida ? format(new Date(h.saida), 'dd/MM HH:mm') : '-'}</td>
                        <td className="px-4 py-3 text-right font-medium text-white">
                          R$ {(h.valor ?? 0).toFixed(2).replace('.', ',')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {view === 'mensalistas' && (
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Mensalistas</h2>
            <button
              type="button"
              onClick={() => { setClientToEdit(null); setModalNovoClienteOpen(true) }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium text-white"
            >
              Novo Cadastro
            </button>
          </div>
          <div className="mb-4">
            <input
              type="text"
              value={searchMensalistas}
              onChange={(e) => setSearchMensalistas(e.target.value)}
              placeholder="Buscar por nome, CPF ou placa..."
              className="w-full max-w-md px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-700/50">
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Nome</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Plano</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Vencimento</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Status</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Placas</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        {clients.length === 0 ? 'Nenhum mensalista cadastrado' : 'Nenhum resultado na busca'}
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((c) => (
                      <tr key={c.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                        <td className="px-4 py-3 text-gray-300">{planLabel(c.plan_type)}</td>
                        <td className="px-4 py-3 text-gray-300">{format(new Date(c.expiry_date), 'dd/MM/yyyy')}</td>
                        <td className="px-4 py-3">
                          <span
                            className={clsx(
                              'px-2 py-1 rounded text-xs font-medium',
                              c.status === 'Ativo' && 'bg-green-900/60 text-green-300',
                              c.status === 'Vencido' && 'bg-red-900/60 text-red-300',
                              c.status === 'Inativo' && 'bg-slate-600 text-slate-300'
                            )}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 text-gray-300"
                          title={formatPlatesDisplay(c.plates ?? []).title}
                        >
                          {formatPlatesDisplay(c.plates ?? []).text}
                        </td>
                        <td className="px-4 py-3 flex gap-1">
                          <button
                            type="button"
                            onClick={() => openEditarCliente(c)}
                            className="p-2 text-gray-400 hover:text-amber-400 rounded"
                            title="Editar"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => openRenovar(c)}
                            className="p-2 text-gray-400 hover:text-green-400 rounded"
                            title="Renovar"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                          {c.status === 'Inativo' ? (
                            <button
                              type="button"
                              onClick={() => openReativarConfirm(c)}
                              className="p-2 text-gray-400 hover:text-green-400 rounded"
                              title="Reativar"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openCancelConfirm(c)}
                              className="p-2 text-gray-400 hover:text-red-400 rounded"
                              title="Cancelar plano"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {view === 'financeiro' && (
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h2 className="text-xl font-bold text-white">Financeiro</h2>
            <div className="flex items-center gap-2">
              <select
                value={financeFilterMonth}
                onChange={(e) => setFinanceFilterMonth(Number(e.target.value))}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={financeFilterYear}
                onChange={(e) => setFinanceFilterYear(Number(e.target.value))}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={async () => {
                const res = await window.api.exportFinancialCsv()
                if (res.success && res.path) showAlert('Exportado', `Arquivo salvo em ${res.path}`, 'success')
                else if (!res.canceled && res.error) showAlert('Erro', friendlyError(res.error), 'error')
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white"
            >
              Exportar CSV
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Total Recebido (Renovações) - {MESES[financeFilterMonth - 1]}/{financeFilterYear}</p>
              <p className="text-2xl font-bold text-green-500">
                R$ {totalRenovacoesMes.toFixed(2).replace('.', ',')}
              </p>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Total Recebido (Avulsos) - {MESES[financeFilterMonth - 1]}/{financeFilterYear}</p>
              <p className="text-2xl font-bold text-white">
                R$ {totalAvulsosMes.toFixed(2).replace('.', ',')}
              </p>
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-700/50">
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Data</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Tipo</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300">Descrição</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-300 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {mixedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">Nenhuma transação</td>
                    </tr>
                  ) : (
                    mixedTransactions.map((t, i) => (
                      <tr key={`${t.type}-${t.date}-${i}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-gray-300">{format(new Date(t.date), 'dd/MM/yyyy HH:mm')}</td>
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
                        <td className="px-4 py-3 text-right font-medium text-white">
                          R$ {t.value.toFixed(2).replace('.', ',')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {view === 'configuracoes' && (
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
              onClick={async () => {
                await window.api.savePrinterConfig(selectedPrinter)
                showAlert('Salvo', 'Configuração de impressora atualizada.', 'success')
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium text-white"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      <ModalCheckout
        open={modalOpen}
        onClose={() => {
          if (!checkoutLoading) {
            setModalOpen(false)
            setCheckoutTicket(null)
          }
        }}
        onConfirm={handleCheckoutConfirm}
        placa={checkoutTicket?.placa ?? ''}
        tipo={checkoutTicket?.tipo ?? ''}
        entrada={checkoutTicket?.entrada ?? ''}
        valor={checkoutValor}
        loading={checkoutLoading}
      />

      <ModalNovoCliente
        open={modalNovoClienteOpen}
        onClose={() => { setModalNovoClienteOpen(false); setClientToEdit(null) }}
        onSuccess={loadClients}
        onAlert={showAlert}
        clientToEdit={clientToEdit}
      />

      {renovarClient && (
        <ModalRenovar
          open={modalRenovarOpen}
          onClose={() => {
            setModalRenovarOpen(false)
            setRenovarClient(null)
          }}
          onSuccess={loadClients}
          clientId={renovarClient.clientId}
          clientName={renovarClient.clientName}
          planType={renovarClient.planType}
          clientCpf={renovarClient.clientCpf}
          clientPhone={renovarClient.clientPhone}
          clientPlates={renovarClient.clientPlates}
          onAlert={showAlert}
        />
      )}

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
        onConfirm={confirmState.onConfirm}
        confirmLabel="Confirmar"
      />
    </div>
  )
}

export default App
