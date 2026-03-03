/**
 * Traduz erros técnicos para mensagens amigáveis em português.
 */
export function friendlyError(error: unknown): string {
  const raw = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message?: unknown }).message)
    : String(error ?? '')
  const msg = raw.trim() || 'erro desconhecido'
  const lower = msg.toLowerCase()

  if (['checkout', 'saída', 'salvar', 'renovar', 'cancelar', 'reativar', 'network'].includes(lower)) {
    return 'Não foi possível concluir a operação. Tente novamente.'
  }

  if (lower.includes('printtimeout') || lower.includes('timedout') || lower.includes('timeout') || lower.includes('printer') || lower.includes('print')) {
    return 'A impressora não respondeu. Verifique se está ligada, o cabo USB e a fila de impressão do Windows.'
  }
  if (lower.includes('constraint') || lower.includes('unique') || lower.includes('duplicate')) {
    return 'Já existe um veículo com esta placa no sistema.'
  }
  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('enotfound')) {
    return 'Erro de conexão. Verifique a rede.'
  }
  if (lower.includes('not found') || lower.includes('enoent')) {
    return 'Arquivo ou recurso não encontrado.'
  }
  if (lower.includes('permission') || lower.includes('eacces')) {
    return 'Sem permissão para realizar esta operação.'
  }

  const short = msg.length > 80 ? msg.slice(0, 77) + '...' : msg
  return `Ocorreu um erro inesperado. Contate o suporte. (${short})`
}
