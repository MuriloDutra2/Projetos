/**
 * Mantém só números. Limita a 11 chars. Formata 000.000.000-00
 */
export function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

/**
 * Formata (11) 99999-9999
 */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/**
 * Máscara de placa para padrão antigo (LLL-NNNN) e Mercosul (LLL-NLNN).
 * - Uppercase, remove tudo que não é letra/número, limita a 7 caracteres.
 * - Insere hífen visual após a 3ª letra.
 * Exemplos: "ABC1234" -> "ABC-1234", "ABC1D23" -> "ABC-1D23"
 */
export function maskPlate(value: string): string {
  const v = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
  if (v.length <= 3) return v
  return `${v.slice(0, 3)}-${v.slice(3)}`
}

/**
 * Retorna a placa sem formatação (sem hífen) para salvar no banco.
 */
export function plateToRaw(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
}

/**
 * Valida placa: exatamente 7 caracteres alfanuméricos.
 * Aceita padrão antigo (ABC1234) e Mercosul (ABC1D23).
 * Regex: 3 letras + 1 número + 1 alfanumérico + 2 números.
 */
export function validatePlate(value: string): boolean {
  const raw = plateToRaw(value)
  if (raw.length !== 7) return false
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(raw)
}

/**
 * Retorna false se a data for futura (maior que hoje).
 */
export function validateDate(dateString: string): boolean {
  if (!dateString) return true
  const d = new Date(dateString)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return d.getTime() <= today.getTime()
}

/**
 * Remove formatação para salvar limpo no banco.
 */
export function unmask(value: string): string {
  return value.replace(/\D/g, '')
}
