import { useState, useMemo } from 'react'

const PLANOS_CALCULADORA = [
  { value: 'MENSAL_CARRO', label: 'Mensal Carro (2h30)', valor: 60 },
  { value: 'MENSAL_MOTO', label: 'Mensal Moto (2h30)', valor: 50 },
  { value: 'MENSAL_CARRO_MOTO', label: 'Carro e Moto (ou 2 carros / 2 motos)', valor: 75 }
]

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateBR(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Retorna a diferença em dias entre duas datas (ignora horário) */
function diffDays(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((utcB - utcA) / msPerDay)
}

interface ProRataResult {
  proximoVencimento: Date
  inicioMesAnterior: Date
  diasRestantes: number
  diasCiclo: number
  valorPorDia: number
  valorProporcional: number
}

function calcularProRata(dataEntrada: Date, valorPlano: number): ProRataResult | null {
  const dia = dataEntrada.getDate()
  const mes = dataEntrada.getMonth()
  const ano = dataEntrada.getFullYear()

  let proximoVencimento: Date
  let inicioMesAnterior: Date

  if (dia <= 10) {
    // Próximo vencimento é dia 10 do mesmo mês
    proximoVencimento = new Date(ano, mes, 10)
    // Início do ciclo é dia 10 do mês anterior
    inicioMesAnterior = new Date(ano, mes - 1, 10)
  } else {
    // Próximo vencimento é dia 10 do mês seguinte
    proximoVencimento = new Date(ano, mes + 1, 10)
    // Início do ciclo é dia 10 do mesmo mês
    inicioMesAnterior = new Date(ano, mes, 10)
  }

  const diasRestantes = diffDays(dataEntrada, proximoVencimento)
  const diasCiclo = diffDays(inicioMesAnterior, proximoVencimento)

  if (diasCiclo <= 0) return null

  const valorPorDia = valorPlano / diasCiclo
  const valorProporcional = Math.round((diasRestantes / diasCiclo) * valorPlano * 100) / 100

  return {
    proximoVencimento,
    inicioMesAnterior,
    diasRestantes,
    diasCiclo,
    valorPorDia: Math.round(valorPorDia * 100) / 100,
    valorProporcional
  }
}

export default function Calculadora(): React.JSX.Element {
  const hoje = new Date()
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

  const [planoSelecionado, setPlanoSelecionado] = useState(PLANOS_CALCULADORA[0].value)
  const [valorManual, setValorManual] = useState<string>(String(PLANOS_CALCULADORA[0].valor))
  const [dataEntrada, setDataEntrada] = useState<string>(hojeISO)

  const valorNumerico = parseFloat(valorManual) || 0

  const resultado = useMemo(() => {
    if (!dataEntrada) return null
    const [ano, mes, dia] = dataEntrada.split('-').map(Number)
    const data = new Date(ano, mes - 1, dia)
    if (isNaN(data.getTime())) return null
    return calcularProRata(data, valorNumerico)
  }, [dataEntrada, valorNumerico])

  function handlePlanoChange(value: string): void {
    setPlanoSelecionado(value)
    const plano = PLANOS_CALCULADORA.find((p) => p.value === value)
    if (plano) {
      setValorManual(String(plano.valor))
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-xl font-bold text-white mb-6">Calculadora Pro-Rata</h2>
      <p className="text-gray-400 text-sm mb-6">
        Calcule o valor proporcional para novos mensalistas que entram no meio do ciclo (vencimento
        todo dia 10).
      </p>

      <div className="max-w-lg">
        {/* Seletor de plano */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">Plano</label>
          <select
            value={planoSelecionado}
            onChange={(e) => handlePlanoChange(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            {PLANOS_CALCULADORA.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} — {formatCurrency(p.valor)}
              </option>
            ))}
          </select>
        </div>

        {/* Valor editável */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Valor do plano (R$)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={valorManual}
            onChange={(e) => setValorManual(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Pré-preenchido pelo plano selecionado. Edite se necessário.
          </p>
        </div>

        {/* Data de entrada */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">Data de entrada</label>
          <input
            type="date"
            value={dataEntrada}
            onChange={(e) => setDataEntrada(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        {/* Resultado */}
        {resultado && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Resultado</h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-300">
                <span>Próximo vencimento:</span>
                <span className="font-medium text-white">
                  {formatDateBR(resultado.proximoVencimento)}
                </span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Dias restantes no ciclo:</span>
                <span className="font-medium text-white">
                  {resultado.diasRestantes} {resultado.diasRestantes === 1 ? 'dia' : 'dias'}
                </span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Dias totais do ciclo:</span>
                <span className="font-medium text-white">
                  {resultado.diasCiclo} {resultado.diasCiclo === 1 ? 'dia' : 'dias'}
                </span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Valor por dia:</span>
                <span className="font-medium text-white">
                  {formatCurrency(resultado.valorPorDia)}
                </span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-600">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-white">Valor proporcional:</span>
                <span className="text-2xl font-bold text-green-400">
                  {formatCurrency(resultado.valorProporcional)}
                </span>
              </div>
            </div>

            {resultado.diasRestantes === 0 && (
              <p className="text-yellow-400 text-sm mt-3">
                ⚠ A data selecionada é o dia do vencimento. O valor proporcional é R$ 0,00.
              </p>
            )}
          </div>
        )}

        {!resultado && dataEntrada && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
            Selecione uma data válida para calcular.
          </div>
        )}
      </div>
    </div>
  )
}
