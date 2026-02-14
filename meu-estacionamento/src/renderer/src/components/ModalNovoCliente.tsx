import { useState, useEffect } from 'react'
import { maskCPF, maskPhone, maskPlate, plateToRaw, unmask, validateDate, validatePlate } from '../utils/masks'
import { friendlyError } from '../utils/errorHandler'

const PLANOS = [
  { value: 'MENSAL_CARRO', label: 'Mensal Carro (2h30) - R$ 60,00', planName: 'Mensal Carro (2h30)', valor: 60 },
  { value: 'MENSAL_MOTO', label: 'Mensal Moto (2h30) - R$ 45,00', planName: 'Mensal Moto (2h30)', valor: 45 },
  { value: 'FUNCIONARIO', label: 'Funcionário (Livre) - R$ 50,00', planName: 'Funcionário (Livre)', valor: 50 }
] as const

export interface ClientToEdit {
  id: number
  name: string
  cpf?: string
  phone?: string
  plan_type: string
  expiry_date: string
  plates: string[]
}

interface ModalNovoClienteProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  onAlert?: (title: string, message: string, type: 'error' | 'success') => void
  /** Quando preenchido, o modal entra em modo edição */
  clientToEdit?: ClientToEdit | null
}

export default function ModalNovoCliente({
  open,
  onClose,
  onSuccess,
  onAlert,
  clientToEdit
}: ModalNovoClienteProps): React.JSX.Element | null {
  const isEdit = !!clientToEdit
  const showAlert = (title: string, message: string, type: 'error' | 'success') => {
    if (onAlert) onAlert(title, message, type)
    else alert(message)
  }
  const [name, setName] = useState('')
  const [cpf, setCpf] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [planType, setPlanType] = useState<string>(PLANOS[0].value)
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [plates, setPlates] = useState<string[]>([''])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && clientToEdit) {
      setName(clientToEdit.name)
      setCpf(clientToEdit.cpf ? maskCPF(clientToEdit.cpf) : '')
      setPhone(clientToEdit.phone ? maskPhone(clientToEdit.phone) : '')
      setPlanType(clientToEdit.plan_type)
      setExpiryDate(clientToEdit.expiry_date.slice(0, 10))
      const rawPlates = clientToEdit.plates ?? []
      const formatted = rawPlates.length > 0
        ? rawPlates.map((pl) => maskPlate(String(pl).trim()))
        : ['']
      setPlates(formatted)
    } else if (open && !clientToEdit) {
      setName('')
      setCpf('')
      setBirthDate('')
      setPhone('')
      setPlanType(PLANOS[0].value)
      const d = new Date()
      d.setMonth(d.getMonth() + 1)
      setExpiryDate(d.toISOString().slice(0, 10))
      setPlates([''])
    }
  }, [open, clientToEdit])

  if (!open) return null

  const addPlate = () => setPlates((p) => [...p, ''])
  const removePlate = (i: number) =>
    setPlates((p) => p.filter((_, idx) => idx !== i))
  const setPlate = (i: number, v: string) =>
    setPlates((p) => {
      const next = [...p]
      next[i] = maskPlate(v)
      return next
    })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      showAlert('Campos obrigatórios', 'Por favor, preencha todos os campos obrigatórios.', 'error')
      return
    }

    const cpfDigits = unmask(cpf)
    if (cpfDigits.length > 0 && cpfDigits.length !== 11) {
      showAlert('CPF inválido', 'CPF deve conter 11 dígitos.', 'error')
      return
    }
    if (birthDate && !validateDate(birthDate)) {
      showAlert('Data inválida', 'Data de nascimento não pode ser futura.', 'error')
      return
    }

    const rawPlates = plates
      .map((p) => plateToRaw(String(p).trim()))
      .filter((p) => p.length > 0)
    const validPlates = rawPlates.filter((p) => validatePlate(p))
    const invalidCount = rawPlates.filter((p) => !validatePlate(p)).length
    if (validPlates.length === 0) {
      showAlert(
        'Placas inválidas',
        invalidCount > 0
          ? 'Cada placa deve ter exatamente 7 caracteres (ex: ABC1234 ou ABC1D23).'
          : 'Adicione ao menos uma placa válida.',
        'error'
      )
      return
    }

    setLoading(true)
    try {
      const payload = {
        name: name.trim(),
        cpf: cpfDigits,
        phone: unmask(phone),
        plan_type: planType,
        expiry_date: new Date(expiryDate).toISOString(),
        plates: validPlates
      }
      const result = isEdit && clientToEdit
        ? await window.api.updateClient({ ...payload, id: clientToEdit.id })
        : await window.api.createClient(payload)
      if (result.success) {
        if (!isEdit) {
          const plan = PLANOS.find((p) => p.value === planType)
          try {
            const printRes = await window.api.printSubscription({
              clientData: {
                name: name.trim(),
                cpf: maskCPF(cpfDigits),
                phone: phone.trim() || '-'
              },
              vehicleList: validPlates.map((p) => maskPlate(p)),
              planData: {
                planName: plan?.planName ?? planType,
                value: plan?.valor ?? 0,
                expiryDate
              }
            })
            if (printRes && !printRes.success) {
              showAlert('Erro de impressão', friendlyError(printRes.error ?? 'printer'), 'error')
            }
          } catch (err) {
            console.error('Erro ao imprimir recibo:', err)
            showAlert('Erro de impressão', friendlyError(err), 'error')
          }
        }
        setName('')
        setCpf('')
        setBirthDate('')
        setPhone('')
        setPlates([''])
        onSuccess()
        onClose()
      } else {
        showAlert(
          isEdit ? 'Erro ao atualizar' : 'Erro ao cadastrar',
          friendlyError(result.error ?? 'salvar'),
          'error'
        )
      }
    } catch (err) {
      console.error(err)
      showAlert('Erro', friendlyError(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">{isEdit ? 'Editar Cliente' : 'Novo Cadastro - Mensalista'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Nome Completo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">CPF</label>
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(maskCPF(e.target.value))}
              placeholder="000.000.000-00"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Data de Nascimento
            </label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Celular</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="(11) 99999-9999"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Plano</label>
            <select
              value={planType}
              onChange={(e) => setPlanType(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
            >
              {PLANOS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Data de Vencimento
            </label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              required
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-300">Veículos (placas)</label>
              <button
                type="button"
                onClick={addPlate}
                className="text-sm text-red-400 hover:text-red-300"
              >
                + Adicionar Veículo
              </button>
            </div>
            <div className="space-y-2">
              {plates.map((plate, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={plate}
                    onChange={(e) => setPlate(i, e.target.value)}
                    placeholder="ABC-1234"
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white uppercase"
                    maxLength={8}
                  />
                  {plates.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePlate(i)}
                      className="px-2 text-gray-400 hover:text-red-400"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded-lg font-medium"
            >
              {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
