import { useState, useEffect, useCallback } from 'react'
import { format, differenceInMinutes } from 'date-fns'
import { clsx } from 'clsx'
import type { Ticket, SubscriptionInfo, View } from '../types/domain'
import {
  createTicket,
  checkoutTicket as checkoutTicketService,
  calculateValue,
  checkPlateSubscription,
  checkPlateWasInToday,
  excludeAllActiveTickets
} from '../services/tickets'
import { printEntry, printExit } from '../services/printer'
import { getFamilyGroup } from '../services/family'
import ModalCheckout from '../components/ModalCheckout'
import ModalSeletorMembro from '../components/ModalSeletorMembro'
import { useTickets } from '../hooks/useTickets'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { useDialog } from '../providers/DialogProvider'
import { maskPlate, plateToRaw } from '../utils/masks'
import { friendlyError } from '../utils/errorHandler'
import logoImg from '../assets/logo.png'

interface InicioProps {
  setView: (v: View) => void
}

export default function Inicio({ setView }: InicioProps): React.JSX.Element {
  const { showAlert } = useDialog()
  // tick exposto pelo hook é usado para forçar re-render do tempo decorrido a cada minuto (D-09)
  const { tickets, reload: reloadTickets } = useTickets()

  const [placa, setPlaca] = useState('')
  const [tipo, setTipo] = useState<'Carro' | 'Moto'>('Carro')
  const [loading, setLoading] = useState(false)
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null)
  const [plateWasInToday, setPlateWasInToday] = useState<boolean | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [checkoutTicket, setCheckoutTicket] = useState<Ticket | null>(null)
  const [checkoutValor, setCheckoutValor] = useState(0)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const [searchPlacaList, setSearchPlacaList] = useState('')
  const [modalExcluirTodosOpen, setModalExcluirTodosOpen] = useState(false)
  const [excluirTodosPassword, setExcluirTodosPassword] = useState('')
  const [excluirTodosLoading, setExcluirTodosLoading] = useState(false)
  const [excluirTodosError, setExcluirTodosError] = useState('')
  const [debtorDecisionOpen, setDebtorDecisionOpen] = useState(false)
  const [pendingEntry, setPendingEntry] = useState<{ plate: string; info: SubscriptionInfo } | null>(null)
  const [garageEntryModal, setGarageEntryModal] = useState<{ plate: string; clientName: string } | null>(null)
  const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null)
  const [pendingFamilyEntry, setPendingFamilyEntry] = useState<{ plate: string; tipo: string } | null>(null)

  useEffect(() => {
    if (placa.length < 7) {
      setPlateWasInToday(null)
      return
    }
    const t = setTimeout(() => {
      checkPlateWasInToday(placa).then(setPlateWasInToday).catch(() => setPlateWasInToday(null))
    }, 300)
    return () => clearTimeout(t)
  }, [placa])

  const handlePlacaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = plateToRaw(e.target.value)
    setPlaca(v)
    if (v.length < 5) setSubscriptionInfo(null)
    if (v.length < 7) setPlateWasInToday(null)
  }

  const handlePlacaBlur = async () => {
    if (placa.length < 5) return
    try {
      const [info, wasInToday] = await Promise.all([
        checkPlateSubscription(placa),
        placa.length >= 7 ? checkPlateWasInToday(placa) : Promise.resolve(false)
      ])
      setSubscriptionInfo(info)
      setPlateWasInToday(placa.length >= 7 ? wasInToday : null)
    } catch (e) {
      setSubscriptionInfo(null)
      setPlateWasInToday(null)
    }
  }

  const handleCheckoutClick = async (ticket: Ticket) => {
    try {
      const res = await calculateValue({
        entrada: ticket.entrada,
        placa: ticket.placa,
        tipo: ticket.tipo,
        ...(ticket.cpf ? { cpf: ticket.cpf } : {})
      })
      setCheckoutValor(res.valor)
    } catch {
      setCheckoutValor(0)
    }
    setCheckoutTicket(ticket)
    setModalOpen(true)
  }

  const handleCheckoutConfirm = async (paymentMethod?: string) => {
    if (!checkoutTicket) return
    setCheckoutLoading(true)
    try {
      const result = await checkoutTicketService({ id: checkoutTicket.id, paymentMethod })
      if (result.success) {
        const valorCobrado = result.valor ?? checkoutValor
        if (valorCobrado > 0 && checkoutTicket.tipo !== 'GARAGEM') {
          try {
            const saida = new Date().toISOString()
            const minutos = differenceInMinutes(new Date(), new Date(checkoutTicket.entrada))
            const tempoTotal = minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)}h ${minutos % 60}min`
            const printRes = await printExit({
              placa: checkoutTicket.placa,
              entrada: checkoutTicket.entrada,
              saida,
              valor: valorCobrado,
              tempoTotal
            })
            if (printRes && !printRes.success) {
              showAlert('Erro de impressão', friendlyError(printRes.error ?? 'printer'), 'error')
            }
          } catch (err) {
            console.error(err)
            showAlert('Erro de impressão', friendlyError(err), 'error')
          }
        }
        setModalOpen(false)
        setCheckoutTicket(null)
        await reloadTickets()
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

  const registerEntryWithType = async (plate: string, typeToSave: string, cpf?: string) => {
    const result = await createTicket({
      placa: plate.toUpperCase(),
      tipo: typeToSave,
      ...(cpf ? { cpf } : {})
    })
    if (result.success) {
      setPlaca('')
      setSubscriptionInfo(null)
      setPlateWasInToday(null)
      if (typeToSave !== 'GARAGEM') {
        try {
          const printRes = await printEntry({
            id: result.id!,
            placa: plate.toUpperCase(),
            entrada: result.entrada ?? new Date().toISOString()
          })
          if (printRes && !printRes.success) {
            showAlert('Erro de impressão', friendlyError(printRes.error ?? 'printer'), 'error')
          }
        } catch (err) {
          console.error(err)
          showAlert('Erro de impressão', friendlyError(err), 'error')
        }
      }
      await reloadTickets()
      return
    }
    const msg = result.message || friendlyError(result.error) || 'Não foi possível registrar. Tente novamente.'
    showAlert(result.message ? 'Atenção' : 'Erro', msg, 'error')
    if (result.message !== 'Veículo já está no pátio!') {
      setPlaca('')
    }
  }

  const handleRegisterEntry = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!placa.trim()) return
    setLoading(true)
    ;(async () => {
      try {
        let tipoToSave: string = tipo
        if (plateToRaw(placa).length >= 7) {
          const info = await checkPlateSubscription(placa)
          if (info?.isSubscriber && !info?.isExpired) {
            if (
              info?.isDebtor &&
              (info?.planType?.startsWith('MENSAL') || info?.planType === 'GARAGEM')
            ) {
              setPendingEntry({ plate: placa, info })
              setDebtorDecisionOpen(true)
              setLoading(false)
              return
            }
            if (info?.planType === 'GARAGEM') {
              setGarageEntryModal({ plate: placa, clientName: info.clientName })
              setSubscriptionInfo(info)
              setLoading(false)
              return
            }
            tipoToSave = 'MENSALISTA'
          }
          setSubscriptionInfo(info)
        }
        const family = await getFamilyGroup(placa)
        if (family && family.members.length > 0) {
          setFamilyGroup(family)
          setPendingFamilyEntry({ plate: placa, tipo: tipoToSave })
          setLoading(false)
          return
        }
        await registerEntryWithType(placa, tipoToSave)
      } catch (err) {
        console.error(err)
        showAlert('Erro', friendlyError(err), 'error')
      } finally {
        setLoading(false)
      }
    })()
  }

  const handleBarcodeScanned = useCallback(
    (value: string) => {
      const scanned = plateToRaw(value)
      if (!scanned) return
      const ticket = tickets.find(
        (t) => plateToRaw(t.placa ?? '') === scanned
      )
      if (ticket) {
        setPlaca('')
        setSearchPlacaList('')
        void handleCheckoutClick(ticket)
      } else {
        showAlert('Placa não encontrada', `Nenhum veículo estacionado com "${maskPlate(scanned)}"`, 'error')
      }
    },
    [tickets, showAlert]
  )

  useBarcodeScanner(handleBarcodeScanned, true)

  const handleFamilyMemberSelected = async (member: FamilyMember) => {
    if (!pendingFamilyEntry) return
    setFamilyGroup(null)
    const { plate, tipo } = pendingFamilyEntry
    setPendingFamilyEntry(null)
    setLoading(true)
    try {
      await registerEntryWithType(plate, tipo, member.cpf)
    } catch (err) {
      showAlert('Erro', friendlyError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const searchPlacaNorm = plateToRaw(searchPlacaList).toUpperCase()
  const filteredTickets =
    searchPlacaNorm.length === 0
      ? tickets
      : tickets.filter((t) => (t.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').includes(searchPlacaNorm))

  return (
    <>
      <div className="w-[30%] min-w-[280px] bg-gray-800 border-r border-gray-700 p-6 flex flex-col">
        <div className="flex items-center gap-4 mb-6">
          <img
            src={logoImg}
            alt="KF Estacionamento"
            className="w-16 h-auto object-contain drop-shadow-lg flex-shrink-0"
          />
          <h1 className="text-2xl font-bold text-white tracking-tight">KF ESTACIONAMENTO</h1>
        </div>
        <form onSubmit={handleRegisterEntry} className="flex flex-col gap-4">
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

          {subscriptionInfo?.isSubscriber && !subscriptionInfo?.isExpired && subscriptionInfo?.planType === 'GARAGEM' && (
            <div className="p-3 rounded-lg bg-emerald-900/40 border border-emerald-600 text-emerald-200 text-sm">
              <strong>GARAGEM:</strong> {subscriptionInfo.clientName} — Acesso livre (sem limite de tempo no pátio).
            </div>
          )}
          {subscriptionInfo?.isSubscriber && !subscriptionInfo?.isExpired && subscriptionInfo?.planType !== 'GARAGEM' && (
            <div className="p-3 rounded-lg bg-green-900/40 border border-green-600 text-green-200 text-sm">
              MENSALISTA DETECTADO: {subscriptionInfo.clientName} — Até {subscriptionInfo.freeMinutes} min grátis
            </div>
          )}
          {subscriptionInfo?.isSubscriber && !subscriptionInfo?.isExpired && subscriptionInfo?.isDebtor && subscriptionInfo?.planType?.startsWith('MENSAL') && (
            <div className="p-3 rounded-lg bg-red-900/40 border border-red-600 text-red-200 text-sm">
              <strong>Saldo devedor:</strong> este mensalista será cobrado como avulso até o pagamento da mensalidade.
            </div>
          )}
          {subscriptionInfo?.isSubscriber && !subscriptionInfo?.isExpired && subscriptionInfo?.isDebtor && subscriptionInfo?.planType === 'GARAGEM' && (
            <div className="p-3 rounded-lg bg-red-900/40 border border-red-600 text-red-200 text-sm">
              <strong>Garagem em atraso:</strong> cobrar como avulso até a quitação da mensalidade da garagem.
            </div>
          )}
          {subscriptionInfo?.isSubscriber && subscriptionInfo?.isExpired && (
            <div className="p-3 rounded-lg bg-amber-900/40 border border-amber-600 text-amber-200 text-sm">
              PLANO VENCIDO EM {format(new Date(subscriptionInfo.expiryDate.slice(0, 10) + 'T12:00:00'), 'dd/MM/yyyy')}! Cobrar como avulso?
            </div>
          )}
          {plateWasInToday === true && (
            <div className="p-3 rounded-lg bg-blue-900/40 border border-blue-500 text-blue-200 text-sm">
              <strong>Atenção:</strong> Este veículo já esteve no estacionamento hoje. A cobrança será feita normalmente (regra de negócio).
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Tipo de Veículo</label>
            <div className="flex gap-2 p-1 bg-gray-700 rounded-lg w-fit flex-wrap">
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
            <li>• 0 a 90 min (avulso): Grátis/dia</li>
            <li>• Mensalista: 2h30/dia grátis • Garagem: ilimitado</li>
            <li>• Mensalistas vencem todo dia 10</li>
            <li>• Pernoite (18h-08h): R$ 50,00</li>
            <li>• Hora extra: R$ 4,00</li>
          </ul>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 flex items-center gap-2">
              <span className="text-gray-400 text-sm">Carros</span>
              <span className="text-xl font-bold text-white">
                {tickets.filter((t) => t.tipo === 'Carro').length}
              </span>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 flex items-center gap-2">
              <span className="text-gray-400 text-sm">Motos</span>
              <span className="text-xl font-bold text-white">
                {tickets.filter((t) => t.tipo === 'Moto').length}
              </span>
            </div>
            {tickets.some((t) => t.tipo === 'MENSALISTA') && (
              <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 flex items-center gap-2">
                <span className="text-gray-400 text-sm">Mensalistas</span>
                <span className="text-xl font-bold text-white">
                  {tickets.filter((t) => t.tipo === 'MENSALISTA').length}
                </span>
              </div>
            )}
            {tickets.some((t) => t.tipo === 'GARAGEM') && (
              <div className="bg-gray-800 border border-emerald-900 rounded-lg px-4 py-2 flex items-center gap-2">
                <span className="text-gray-400 text-sm">Garagem</span>
                <span className="text-xl font-bold text-emerald-400">
                  {tickets.filter((t) => t.tipo === 'GARAGEM').length}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-white sm:mr-2">Veículos Estacionados</h2>
            <input
              type="text"
              value={maskPlate(searchPlacaList)}
              onChange={(e) => setSearchPlacaList(plateToRaw(e.target.value))}
              placeholder="Buscar por placa..."
              className="w-full sm:max-w-xs px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 uppercase"
              maxLength={8}
            />
            <button
              type="button"
              onClick={() => {
                setExcluirTodosPassword('')
                setExcluirTodosError('')
                setModalExcluirTodosOpen(true)
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-gray-300 font-medium"
            >
              Excluir todos do pátio
            </button>
          </div>
        </div>
        {tickets.length === 0 ? (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-lg">Nenhum veículo estacionado</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-lg">Nenhum veículo encontrado com a placa &quot;{maskPlate(searchPlacaList) || '—'}&quot;</p>
            <p className="text-sm mt-2">Digite outra placa ou limpe a busca para ver todos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTickets.map((ticket) => {
              const tempoDecorrido = calcularTempoDecorrido(ticket.entrada)
              const isGaragemTicket = ticket.tipo === 'GARAGEM'
              const freeMin = ticket.tipo === 'MENSALISTA' ? 150 : 90
              const isAlerta = !isGaragemTicket && tempoDecorrido > freeMin
              const tipoLabel = isGaragemTicket ? 'Garagem (acesso livre)' : ticket.tipo
              return (
                <div
                  key={ticket.id}
                  className={clsx(
                    'p-4 rounded-lg border-2 transition-all',
                    isAlerta ? 'bg-red-900/30 border-red-500' : isGaragemTicket ? 'bg-emerald-950/40 border-emerald-700' : 'bg-gray-800 border-gray-700'
                  )}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-2xl font-bold text-white">{ticket.placa}</div>
                      <div className="text-sm text-gray-400">{tipoLabel}</div>
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
                      <span className="text-gray-400">Tempo no pátio: </span>
                      <span className={clsx('font-bold', isGaragemTicket ? 'text-emerald-300' : isAlerta ? 'text-red-400' : 'text-green-400')}>
                        {isGaragemTicket ? '— (sem cobrança por tempo)' : formatarTempo(tempoDecorrido)}
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

      <ModalCheckout
        open={modalOpen}
        onClose={() => {
          if (!checkoutLoading) {
            setModalOpen(false)
            setCheckoutTicket(null)
          }
        }}
        onConfirm={handleCheckoutConfirm}
        onExclude={async () => {
          await reloadTickets()
        }}
        ticketId={checkoutTicket?.id}
        placa={checkoutTicket?.placa ?? ''}
        tipo={checkoutTicket?.tipo ?? ''}
        entrada={checkoutTicket?.entrada ?? ''}
        valor={checkoutValor}
        loading={checkoutLoading}
      />

      {modalExcluirTodosOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => !excluirTodosLoading && setModalExcluirTodosOpen(false)}>
          <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 shadow-xl max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Excluir todos do pátio</h3>
            <p className="text-sm text-gray-400 mb-4">Digite a senha para remover todos os veículos do pátio sem cobrança.</p>
            <input
              type="password"
              value={excluirTodosPassword}
              onChange={(e) => { setExcluirTodosPassword(e.target.value); setExcluirTodosError('') }}
              placeholder="Senha"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
              autoFocus
            />
            {excluirTodosError && <p className="text-sm text-red-400 mb-2">{excluirTodosError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setModalExcluirTodosOpen(false)}
                disabled={excluirTodosLoading}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setExcluirTodosError('')
                  setExcluirTodosLoading(true)
                  try {
                    const res = await excludeAllActiveTickets({ password: excluirTodosPassword })
                    if (res.success) {
                      setModalExcluirTodosOpen(false)
                      setExcluirTodosPassword('')
                      showAlert('Sucesso', 'Todos os veículos foram removidos do pátio.', 'success')
                      await reloadTickets()
                    } else {
                      setExcluirTodosError(res.error ?? 'Senha incorreta.')
                    }
                  } catch (e) {
                    setExcluirTodosError('Erro ao executar. Tente novamente.')
                  } finally {
                    setExcluirTodosLoading(false)
                  }
                }}
                disabled={excluirTodosLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium disabled:opacity-50"
              >
                {excluirTodosLoading ? 'Aguarde...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {garageEntryModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[75]">
          <div className="bg-gray-800 border-2 border-emerald-600 rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl">
            <h3 className="text-xl font-bold text-emerald-300 mb-2">Cliente Garagem</h3>
            <p className="text-sm text-gray-200 mb-4">
              <strong>{garageEntryModal.clientName}</strong> — Acesso livre no pátio; o sistema apenas registra entrada e saída (sem impressão de ticket).
            </p>
            <div className="flex gap-3 justify-end flex-wrap">
              <button
                type="button"
                onClick={() => setGarageEntryModal(null)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const g = garageEntryModal
                  setGarageEntryModal(null)
                  setLoading(true)
                  try {
                    await registerEntryWithType(g.plate, 'GARAGEM')
                  } finally {
                    setLoading(false)
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium"
              >
                Confirmar entrada
              </button>
            </div>
          </div>
        </div>
      )}

      {debtorDecisionOpen && pendingEntry && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70]">
          <div className="bg-gray-800 border-2 border-red-600 rounded-xl p-6 max-w-lg w-full mx-4">
            <h3 className="text-xl font-bold text-red-300 mb-2 text-center">
              {pendingEntry.info.planType === 'GARAGEM' ? 'Garagem em atraso' : 'Mensalista com saldo devedor'}
            </h3>
            <p className="text-sm text-gray-200 text-center mb-4">
              {pendingEntry.info.planType === 'GARAGEM'
                ? 'Esta garagem está inadimplente. Pode ser cobrada como avulso ou quitar a mensalidade no cadastro.'
                : 'Este mensalista está inadimplente. Hoje ele pode ser cobrado como avulso ou quitar a mensalidade agora.'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={async () => {
                  const info = pendingEntry.info
                  let fallbackType: 'Carro' | 'Moto' = tipo
                  if (info.planType === 'MENSAL_MOTO') fallbackType = 'Moto'
                  if (info.planType === 'MENSAL_CARRO') fallbackType = 'Carro'
                  if (info.planType === 'GARAGEM') fallbackType = tipo
                  await registerEntryWithType(pendingEntry.plate, fallbackType)
                  setDebtorDecisionOpen(false)
                  setPendingEntry(null)
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
              >
                Cobrar como avulso
              </button>
              <button
                type="button"
                onClick={() => {
                  setDebtorDecisionOpen(false)
                  setPendingEntry(null)
                  setView('mensalistas')
                  showAlert(
                    'Quitar mensalidade',
                    pendingEntry.info.planType === 'GARAGEM'
                      ? 'Use o botão Renovar no cadastro do cliente garagem para quitar.'
                      : 'Use o botão Renovar no cadastro do cliente para quitar e liberar benefício mensalista.',
                    'success'
                  )
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
              >
                Quitar agora
              </button>
            </div>
          </div>
        </div>
      )}
      {familyGroup && pendingFamilyEntry && (
        <ModalSeletorMembro
          plate={familyGroup.plate}
          members={familyGroup.members}
          onSelect={handleFamilyMemberSelected}
          onCancel={() => {
            setFamilyGroup(null)
            setPendingFamilyEntry(null)
          }}
        />
      )}
    </>
  )
}
