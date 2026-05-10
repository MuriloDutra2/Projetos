# Phase 1: Refatoração do Renderer - Research

**Researched:** 2026-05-10
**Domain:** React component decomposition, Electron IPC typed service layer, React Context
**Confidence:** HIGH — all findings verified against actual source code read in this session

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Granularidade:** Um arquivo por view em `src/renderer/src/views/`. Sem subpasta-por-view salvo se algum arquivo ultrapassar 350 linhas durante a execução.

**D-02 — Camada de IPC tipada:** Services finos em `src/renderer/src/services/` são a única porta de entrada para `window.api`. Hooks em `src/renderer/src/hooks/` apenas onde há ciclo de fetch + estado + refresh React. `printEntry`/`printExit` adicionados ao preload antes de qualquer extração de view.

**D-03 — Estado compartilhado:** `alertState` e `confirmState` sobem para `<DialogProvider>` com hook `useDialog()`. `view`/`setView` permanece na raiz do App. Estado por view desce para dentro da view.

**D-04 — Roteamento:** Manter `type View` union + render condicional. Sem `react-router-dom`.

**D-05 — Tipos de domínio:** `Ticket`, `HistoryEntry`, `ClientRow`, `SubscriptionInfo`, `ClientStatement` movem para `src/renderer/src/types/domain.ts`.

**D-06 — Estilo:** CONVENTIONS.md é a referência: sem `;`, single quote, `export default` para componente, named export para helpers, Tailwind + `clsx`, sem barrel `index.ts`.

**D-07 — Ordem de migração:** (1) services + tipos → (2) preload fix → (3) DialogProvider → (4) views, menor primeiro → (5) hooks à medida.

**D-08 — Limite de linhas:** ~400 linhas como guideline, validado por inspeção, não por lint rule.

**D-09 — Micro-débitos:** `setInterval` re-render hack vira `useState<number>` tick em `useTickets`; `mixedTransactionsAll` ganha `useMemo` em `Financeiro.tsx` — apenas se não complicar.

### Claude's Discretion

D-01, D-02, D-03, D-04 foram delegadas ao Claude; as decisões estão registradas acima e podem ser contestadas antes da execução.

### Deferred Ideas (OUT OF SCOPE)

- Remover `electronAPI` do preload (IPC-01) — v2
- Validação runtime de payloads IPC com zod (IPC-02) — v2
- Testes de componente React novos (TEST-01, TEST-02) — v2
- Senhas hardcoded — Phase 4
- Backup automático — Phase 3
- Família por CPF — Phase 5
- Race condition em `create-ticket` e foreign keys em delete client — fases futuras que tocam main process
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REF-01 | `App.tsx` dividido em componentes por área funcional; nenhum arquivo do renderer ultrapassa ~400 linhas | Inventário de linhas por view section (seção abaixo); extração de 7 views confirmada viável |
| REF-02 | Chamadas IPC via hooks/serviços tipados — zero `window.api` direto em componentes; eliminar `window.electron.ipcRenderer.invoke` | Inventário completo de 30 chamadas `window.api` + 2 chamadas ilegais catalogadas abaixo |
| REF-03 | Testes existentes permanecem verdes; fluxo principal validado via UAT manual | Gate commands identificados; UAT checklist em `TESTES-ANTES-DO-PENDRIVE.md` |
</phase_requirements>

---

## Summary

`App.tsx` tem 1839 linhas e constitui a totalidade do renderer React: 7 blocos de view, 35+ `useState`, 4 efeitos, todos os handlers de IPC e toda a lógica de navegação. O refactor não adiciona nenhuma capacidade visível ao operador — é habilitador de todas as fases seguintes.

A decomposição segue três trilhos independentes que podem ser executados sequencialmente com commits atômicos: (1) extrair a camada de service/tipos (sem tocar JSX ainda), (2) consertar o anti-pattern do preload e (3) extrair as views uma a uma, da menor para a maior, com o `<DialogProvider>` criado antes da primeira view que usa `showAlert`. Cada commit passa `typecheck + lint + test:unit` antes de seguir.

O risco principal é a extração de `Inicio.tsx` (view mais complexa: barcode scanner, debtor flow, garage modal, `window.electron.ipcRenderer.invoke` para print-entry) e de `Mensalistas.tsx` (4 sub-modais, CRUD completo, statement inline). Ambas devem ser extraídas por último, depois que o provider e os services estiverem estabilizados.

**Primary recommendation:** Seguir a ordem D-07 com commits atômicos; nunca extrair JSX e re-estruturar estado na mesma operação — separar em dois commits distintos sempre que possível.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Navegação entre views | Renderer (App.tsx) | — | `type View` union + `useState<View>`; sem URL, sem histórico necessário |
| IPC calls tipadas | Renderer (services/) | — | services/ é a única porta; main process é dono da lógica |
| Estado de alerta/confirmação global | Renderer (DialogProvider) | — | Consumido por todas as views; Context é o padrão correto |
| Estado por view (placa, tickets, filters) | Renderer (view component) | — | Não é compartilhado; fica local na view que o usa |
| Impressão de tickets | Main process | Renderer (services/printer.ts) | Handler IPC no main; renderer só chama via service |
| Persistência de dados | Main process (db.ts) | — | SQLite exclusivamente no main; renderer só lê via IPC |
| Polling de tempo decorrido | Renderer (useTickets) | — | Timer local no hook; sem round-trip ao main |

---

## IPC Channel Inventory (completo — base para os services)

Todos os canais verificados lendo `src/preload/index.ts` e `src/preload/index.d.ts`. [VERIFIED: source read]

### Canais por service de destino

**`services/tickets.ts`** — 7 chamadas:
| `window.api` method | Canal IPC | Retorno |
|---------------------|-----------|---------|
| `getTickets()` | `get-tickets` | `Promise<any[]>` |
| `createTicket({ placa, tipo })` | `create-ticket` | `{ success, id?, entrada?, billedAsAvulso?, error?, message? }` |
| `checkoutTicket({ id })` | `checkout-ticket` | `{ success, valor?, error? }` |
| `calculateValue({ entrada, placa?, tipo? })` | `calculate-value` | `{ valor: number }` |
| `checkPlateSubscription(placa)` | `check-plate-subscription` | `{ isSubscriber, clientId?, clientName, planType, isExpired, expiryDate, freeMinutes, isDebtor }` |
| `checkPlateWasInToday(placa)` | `check-plate-was-in-today` | `Promise<boolean>` |
| `excludeTicket({ id, password })` | `exclude-ticket` | `{ success, error? }` |

**`services/clients.ts`** — 6 chamadas:
| `window.api` method | Canal IPC | Retorno |
|---------------------|-----------|---------|
| `getClients()` | `get-clients` | `Promise<any[]>` |
| `createClient(data)` | `create-client` | `{ success, id?, error? }` |
| `updateClient(data)` | `update-client` | `{ success, error? }` |
| `toggleClientStatus({ clientId, active })` | `toggle-client-status` | `{ success, error? }` |
| `deleteClient({ clientId, password })` | `delete-client` | `{ success, error? }` |
| `getClientStatement(clientId)` | `get-client-statement` | `ClientStatement | null` |

**`services/financial.ts`** — 3 chamadas:
| `window.api` method | Canal IPC | Retorno |
|---------------------|-----------|---------|
| `getFinancialHistory()` | `get-financial-history` | `Promise<any[]>` |
| `getFinancialSummaryByMethod({ month, year })` | `get-financial-summary-by-method` | `{ payment_method, total }[]` |
| `exportFinancialCsv()` | `export-financial-csv` | `{ success, path?, canceled?, error? }` |

**`services/reports.ts`** — 7 chamadas:
| `window.api` method | Canal IPC | Retorno |
|---------------------|-----------|---------|
| `getHistory()` | `get-history` | `Promise<any[]>` |
| `getHistoryForDay(dateStr)` | `get-history-for-day` | `Promise<any[]>` |
| `getHistoryLast24h()` | `get-history-last24h` | `Promise<any[]>` |
| `getDailyReport(dateStr)` | `get-daily-report` | `{ totalAvulsos, planosVendidosCount, planosVendidosValue, saved }` |
| `saveDailyReport(data)` | `save-daily-report` | `{ success, error? }` |
| `exportDailyReportPdf(data)` | `export-daily-report-pdf` | `{ success, path?, canceled?, error? }` |
| `getExcludedTickets()` | `get-excluded-tickets` | `{ id, placa, tipo, entrada, saida }[]` |
| `excludeAllActiveTickets({ password })` | `exclude-all-active-tickets` | `{ success, error? }` |

**`services/printer.ts`** — 3 chamadas (sendo 2 anti-patterns a corrigir):
| Método atual | Como chama | Destino após fix |
|--------------|-----------|------------------|
| `window.electron.ipcRenderer.invoke('print-entry', ...)` | **ANTI-PATTERN** — `App.tsx:440` | `window.api.printEntry(...)` após fix do preload |
| `window.electron.ipcRenderer.invoke('print-exit', ...)` | **ANTI-PATTERN** — `App.tsx:346` | `window.api.printExit(...)` após fix do preload |
| `window.api.printSubscription(data)` | já tipado via `api` | `services/printer.ts:printSubscription()` |
| `window.api.getPrinters()` | tipado | `services/printer.ts:getPrinters()` |
| `window.api.getPrinterConfig()` | tipado | `services/printer.ts:getPrinterConfig()` |
| `window.api.savePrinterConfig(name)` | tipado | `services/printer.ts:savePrinterConfig()` |
| `window.api.renewSubscription(data)` | tipado (em ModalRenovar) | `services/clients.ts:renewSubscription()` |

**Total `window.api` calls em App.tsx:** ~26 chamadas diretas + 2 via `window.electron.ipcRenderer.invoke` (ilegais). [VERIFIED: source read]

---

## Estado em App.tsx: compartilhado vs. view-local

[VERIFIED: source read — linhas 106-178 de App.tsx]

### Estado que sobe para `<DialogProvider>` (Context)

| useState | Tipo | Motivo para subir |
|----------|------|-------------------|
| `alertState` | `{ open, title, message, type }` | Chamado de ~15 lugares; todas as views e modais usam `showAlert()` |
| `confirmState` | `{ open, title, message, onConfirm }` | Mesmo padrão; `openCancelConfirm` e `openReativarConfirm` chamam de Mensalistas |

### Estado que fica na raiz de App (não vira Context)

| useState | Tipo | Motivo para ficar no App |
|----------|------|--------------------------|
| `view` / `setView` | `View` | É o roteador; sidebar e modais cruzam views (ex: debtorDecision redireciona para 'mensalistas') |
| `tickets` | `Ticket[]` | Needed by Inicio (render) e pelo `handleBarcodeScanned` callback; possivelmente move para `useTickets` |
| `modalOpen` + `checkoutTicket` + `checkoutValor` + `checkoutLoading` | — | Estado do ModalCheckout; pode descer para Inicio.tsx que é o único que abre esse modal |

### Estado view-local que desce para dentro da view

| View destino | useState a mover | Notas |
|-------------|------------------|-------|
| `Inicio.tsx` | `placa`, `tipo`, `loading`, `subscriptionInfo`, `plateWasInToday`, `searchPlacaList`, `debtorDecisionOpen`, `pendingEntry`, `garageEntryModal`, `modalOpen`, `checkoutTicket`, `checkoutValor`, `checkoutLoading`, `modalExcluirTodosOpen`, `excluirTodosPassword`, `excluirTodosLoading`, `excluirTodosError` | 18 estados — maior concentração |
| `Historico.tsx` | `history`, `historyDay`, `historyForDay`, `historyLast24h`, `historicoFiltro24h`, `searchHistoricoPlaca` | 6 estados |
| `Relatorio.tsx` | `reportDay`, `dailyReport` | 2 estados; precisa ler `tickets` para o save (passar como prop) |
| `Mensalistas.tsx` | `clients`, `searchMensalistas`, `modalNovoClienteOpen`, `clientToEdit`, `modalRenovarOpen`, `renovarClient`, `statementOpen`, `statementData`, `deleteClientModal`, `deleteClientPassword`, `deleteClientError`, `deleteClientLoading` | 12 estados |
| `Financeiro.tsx` | `history` (shared com Historico via hook), `financialHistory`, `financialByMethod`, `financeFilterMonth`, `financeFilterYear` | 5 estados; `mixedTransactionsAll` vira `useMemo` |
| `Excluidos.tsx` | `excludedTickets` | 1 estado; view mais simples |
| `Configuracoes.tsx` | `printers`, `selectedPrinter` | 2 estados |

**Observação crítica:** `tickets` e `history` são compartilhados entre Inicio + Financeiro/Historico (após checkout, Inicio refresca Historico e Financeiro se estiverem visíveis). A solução após a extração: cada view busca seus dados no `useEffect` de mount — não há estado cross-view para tickets em runtime porque apenas uma view é renderizada por vez. O único caso cross-view é o `handleCheckoutConfirm` que, se o usuário estiver em `view === 'historico'` ou `'financeiro'`, também precisa refrescar. Como a view muda por `setView`, isso deixa de ser problema quando cada view faz `useEffect` no mount. [VERIFIED: App.tsx:364-371]

---

## Inventário de window.api calls por view section

[VERIFIED: source read completo de App.tsx]

### View: `inicio` (linha 691–917 do JSX + handlers 282–531)

| Chamada | Contexto | Service destino |
|---------|----------|-----------------|
| `window.api.checkPlateSubscription(placa)` | `handlePlacaBlur` + `handleRegisterEntry` | `services/tickets.ts` |
| `window.api.checkPlateWasInToday(placa)` | `handlePlacaBlur` + useEffect debounce | `services/tickets.ts` |
| `window.api.getTickets()` | `loadTickets()` — chamado no boot e após saída | `services/tickets.ts` |
| `window.api.createTicket({ placa, tipo })` | `registerEntryWithType()` | `services/tickets.ts` |
| `window.api.calculateValue(...)` | `handleCheckoutClick()` | `services/tickets.ts` |
| `window.api.checkoutTicket({ id })` | `handleCheckoutConfirm()` | `services/tickets.ts` |
| `window.electron.ipcRenderer.invoke('print-entry', ...)` | `registerEntryWithType()` **ANTI-PATTERN** | → `services/printer.ts` após fix |
| `window.electron.ipcRenderer.invoke('print-exit', ...)` | `handleCheckoutConfirm()` **ANTI-PATTERN** | → `services/printer.ts` após fix |
| `window.api.getHistoryLast24h()` | `handleCheckoutConfirm()` se view === 'historico' | → não precisa ficar em Inicio; ver nota abaixo |
| `window.api.getHistoryForDay(historyDay)` | `handleCheckoutConfirm()` se view === 'historico' | → idem |
| `window.api.getFinancialHistory()` | `handleCheckoutConfirm()` se view === 'financeiro' | → idem |
| `window.api.excludeAllActiveTickets({ password })` | modal "Excluir todos" inline no Inicio JSX | `services/tickets.ts` |
| `window.api.getExcludedTickets()` | após excludeAll, se view === 'excluidos' | → não precisa ficar em Inicio |

**Nota cross-view:** As chamadas que refrescam Historico/Financeiro/Excluidos após ações do Inicio são artefatos do estado monolítico. Após a extração, cada view faz `useEffect` no mount e reage ao ser re-renderizada quando o roteador troca `view`. As chamadas de refetch cross-view em `handleCheckoutConfirm` podem ser removidas — a troca de view já dispara o fetch da view destino.

### View: `historico` (linha 919–1018)

| Chamada | Contexto |
|---------|----------|
| `window.api.getHistoryLast24h()` | useEffect view switch + toggle 24h |
| `window.api.getHistoryForDay(historyDay)` | useEffect view switch + troca de data |

### View: `relatorio` (linha 1020–1133)

| Chamada | Contexto |
|---------|----------|
| `window.api.getDailyReport(reportDay)` | useEffect view switch + troca de data |
| `window.api.saveDailyReport(data)` | botão "Salvar relatório" inline |
| `window.api.exportDailyReportPdf(data)` | botão "Baixar PDF" inline |

**Nota:** Relatorio lê `tickets` para calcular `qtyCars`/`qtyMotos` ao salvar (linha 1077). Após extração, Relatorio.tsx recebe `tickets` como prop OU relê via `services/tickets.ts.getTickets()` — a segunda opção é mais simples.

### View: `mensalistas` (linha 1135–1336 + modals 1537-1561)

| Chamada | Contexto |
|---------|----------|
| `window.api.getClients()` | `loadClients()` — useEffect view switch |
| `window.api.toggleClientStatus({ clientId, active })` | `openCancelConfirm` e `openReativarConfirm` (via confirmState) |
| `window.api.getClientStatement(c.id)` | botão extrato inline no map de clientes |
| Modais `ModalNovoCliente` e `ModalRenovar` fazem suas próprias calls | via props `onSuccess={loadClients}` |

### View: `financeiro` (linha 1338–1443)

| Chamada | Contexto |
|---------|----------|
| `window.api.getFinancialHistory()` | `loadFinancialHistory()` — useEffect |
| `window.api.getFinancialSummaryByMethod({ month, year })` | useEffect com deps `financeFilterMonth, financeFilterYear` |
| `window.api.exportFinancialCsv()` | botão "Exportar CSV" inline |
| `window.api.getHistory()` | `loadHistory()` — reutilizado de Inicio (para `mixedTransactionsAll`) |

### View: `excluidos` (linha 1445–1480)

| Chamada | Contexto |
|---------|----------|
| `window.api.getExcludedTickets()` | useEffect view switch |

### View: `configuracoes` (linha 1482–1514)

| Chamada | Contexto |
|---------|----------|
| `window.api.getPrinters()` | useEffect view switch |
| `window.api.getPrinterConfig()` | useEffect view switch |
| `window.api.savePrinterConfig(name)` | botão "Salvar" inline |

---

## Estimativa de linhas por view section (para validar REF-01)

[VERIFIED: contado a partir dos delimitadores lidos em App.tsx]

| View | Bloco JSX (linhas aprox.) | Handlers/state associados | Total estimado no arquivo destino |
|------|--------------------------|---------------------------|----------------------------------|
| `Inicio.tsx` | ~226 (linhas 691–916) | ~180 (handlers 282–531, debtor modal 1743–1792, garage modal 1707–1741, excluirTodos 1582–1635) | ~300–350 linhas — dentro do limite |
| `Historico.tsx` | ~99 (linhas 919–1018) | ~20 (handlers no useEffect) | ~120 linhas |
| `Relatorio.tsx` | ~113 (linhas 1020–1133) | ~10 (handlers inline) | ~130 linhas |
| `Mensalistas.tsx` | ~201 (linhas 1135–1336) | ~80 (handlers openCancelConfirm, openRenovar, statement modal 1794–1834, deleteClient modal 1637–1705) | ~220–250 linhas |
| `Financeiro.tsx` | ~105 (linhas 1338–1443) | ~15 (exportCsv handler inline, useMemo) | ~130 linhas |
| `Excluidos.tsx` | ~35 (linhas 1445–1480) | ~5 | ~50 linhas |
| `Configuracoes.tsx` | ~32 (linhas 1482–1514) | ~5 | ~50 linhas |

**Todos os arquivos de view ficam muito abaixo de 400 linhas.** O risco de subpasta não existe para esta fase.

---

## Dependências entre as 7 views (determina a ordem de extração)

[VERIFIED: source read]

```
Excluidos   ← sem dependências de outras views
Configuracoes ← sem dependências de outras views
Historico   ← sem dependências de outras views
Relatorio   ← lê tickets para qtyCars/qtyMotos (prop simples, ou re-fetch)
Financeiro  ← lê history (avulsos) — resolve com useFinancial hook que chama getHistory()
Mensalistas ← usa ModalNovoCliente, ModalRenovar (já existem), confirmState (DialogProvider)
Inicio      ← usa useBarcodeScanner, ModalCheckout, confirmState (DialogProvider), handleBarcodeScanned, tickets
```

**Ordem de extração recomendada (menor dependência primeiro):**
1. `Excluidos.tsx` — 1 state, 1 API call, zero dependências externas
2. `Configuracoes.tsx` — 2 states, 3 API calls, zero dependências externas
3. `Historico.tsx` — 6 states, 2 API calls, zero dependências externas
4. `Relatorio.tsx` — 2 states + tickets prop, 3 API calls; depende que tickets esteja disponível (prop ou re-fetch)
5. `Financeiro.tsx` — 5 states, 3 API calls; depende de getHistory + getFinancialHistory
6. `Mensalistas.tsx` — 12 states, modais existentes; depende do DialogProvider (deve estar criado antes)
7. `Inicio.tsx` — 18+ states; depende de DialogProvider, useBarcodeScanner, ModalCheckout, services/printer.ts (printEntry/printExit já corrigidos no preload)

Esta ordem garante que cada commit pode ser testado de forma isolada: o App.tsx diminui um bloco por vez, e o novo arquivo de view pode ser verificado com typecheck imediatamente.

---

## Standard Stack

### Core (já instalado — nenhum pacote novo necessário)

| Biblioteca | Versão atual | Papel |
|-----------|-------------|-------|
| React | 19.2.1 | JSX, hooks, Context API |
| TypeScript | 5.9.3 | Tipagem estrita |
| `clsx` | 2.1.1 | Classes condicionais |
| `date-fns` | 4.1.0 | Formatação de datas nas views |
| Tailwind CSS | 3.4.17 | Estilo |
| Vitest | 3.2.4 | Testes existentes |

**Zero dependências novas para esta fase.** [VERIFIED: package.json]

### Sem instalar

Esta fase é puramente reorganização de código dentro do renderer. Nenhum `npm install` necessário.

---

## Architecture Patterns

### Diagrama do estado pós-refactor

```
src/renderer/src/main.tsx
  └── <DialogProvider>              ← provider wraps App
        └── <App>
              ├── sidebar (setView)
              ├── view === 'inicio'     → <Inicio tickets={tickets} setView={setView} />
              ├── view === 'historico'  → <Historico />
              ├── view === 'relatorio'  → <Relatorio tickets={tickets} />
              ├── view === 'mensalistas'→ <Mensalistas />
              ├── view === 'financeiro' → <Financeiro />
              ├── view === 'excluidos'  → <Excluidos />
              └── view === 'configuracoes' → <Configuracoes />

services/
  tickets.ts    → window.api.{getTickets, createTicket, checkoutTicket, calculateValue,
                              checkPlateSubscription, checkPlateWasInToday, excludeTicket,
                              excludeAllActiveTickets}
  clients.ts    → window.api.{getClients, createClient, updateClient, toggleClientStatus,
                              deleteClient, getClientStatement, renewSubscription}
  financial.ts  → window.api.{getFinancialHistory, getFinancialSummaryByMethod, exportFinancialCsv}
  reports.ts    → window.api.{getHistory, getHistoryForDay, getHistoryLast24h, getDailyReport,
                              saveDailyReport, exportDailyReportPdf, getExcludedTickets,
                              excludeAllActiveTickets}
  printer.ts    → window.api.{printEntry, printExit, printSubscription,
                              getPrinters, getPrinterConfig, savePrinterConfig}
  types.ts      → re-exporta tipos de domain.ts

types/
  domain.ts     → Ticket, HistoryEntry, ClientRow, SubscriptionInfo, ClientStatement

providers/
  DialogProvider.tsx → <DialogProvider> + useDialog() + <AlertModal> montado uma vez

hooks/
  useBarcodeScanner.ts  (existente, sem mudança)
  useTickets.ts         → fetch inicial + setInterval tick → consome services/tickets.ts
  useClients.ts         → fetch + refresh → consome services/clients.ts
  useFinancial.ts       → fetch mês selecionado → consome services/financial.ts
  useDailyReport.ts     → fetch data selecionada → consome services/reports.ts
  useGlobalShortcuts.ts → Escape, Ctrl+N — escuta única no document
```

### Padrão de service (função pura, sem estado React)

```typescript
// Source: verificado em services/tickets.ts (a criar)
// Padrão: wrapper fino sobre window.api com tipo de retorno explícito
export async function getTickets(): Promise<Ticket[]> {
  return window.api.getTickets()
}

export async function createTicket(data: { placa: string; tipo: string }): Promise<{
  success: boolean
  id?: number
  entrada?: string
  billedAsAvulso?: boolean
  error?: string
  message?: string
}> {
  return window.api.createTicket(data)
}
```

### Padrão de DialogProvider

```typescript
// Source: verificado em providers/DialogProvider.tsx (a criar)
// Padrão: Context nativo do React, sem dependência externa
import { createContext, useContext, useState } from 'react'
import AlertModal from '../components/AlertModal'

interface DialogContextValue {
  showAlert: (title: string, message: string, type: 'error' | 'success') => void
  showConfirm: (title: string, message: string, onConfirm: () => void) => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used within DialogProvider')
  return ctx
}

export default function DialogProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [alertState, setAlertState] = useState<{...}>({ open: false, ... })
  const [confirmState, setConfirmState] = useState<{...}>({ open: false, ... })

  const showAlert = (title: string, message: string, type: 'error' | 'success') =>
    setAlertState({ open: true, title, message, type })

  const showConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmState({ open: true, title, message, onConfirm })

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AlertModal
        isOpen={alertState.open}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        onClose={() => setAlertState(s => ({ ...s, open: false }))}
      />
      <AlertModal
        isOpen={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        type="error"
        onClose={() => setConfirmState(s => ({ ...s, open: false }))}
        confirmMode
        onConfirm={confirmState.onConfirm}
        confirmLabel="Confirmar"
      />
    </DialogContext.Provider>
  )
}
```

### Padrão de fix do preload (printEntry/printExit)

```typescript
// Source: verificado em src/preload/index.ts (a modificar)
// Adicionar ao objeto api em src/preload/index.ts:
printEntry: (data: { id: number; placa: string; entrada: string }) =>
  ipcRenderer.invoke('print-entry', data),
printExit: (data: { placa: string; entrada: string; saida: string; valor: number; tempoTotal: string }) =>
  ipcRenderer.invoke('print-exit', data),

// Adicionar à Window['api'] em src/preload/index.d.ts:
printEntry: (data: { id: number; placa: string; entrada: string }) => Promise<{ success: boolean; error?: string }>
printExit: (data: { placa: string; entrada: string; saida: string; valor: number; tempoTotal: string }) => Promise<{ success: boolean; error?: string }>
```

### Anti-Patterns a evitar

- **Criar hook por endpoint:** `useGetTickets`, `useGetClients` separados — não fazer. Hook só onde há ciclo de vida complexo (timer, fetch + refresh + estado).
- **Barrel files:** `src/renderer/src/views/index.ts` exportando tudo — CONVENTIONS proíbe. Cada `import` aponta direto para o arquivo.
- **Mover JSX e reestruturar estado no mesmo commit:** sempre separar em commits atômicos (mover primeiro, então reestruturar).
- **Chamar `window.api` diretamente dentro de uma view:** todo acesso IPC deve ir por `services/`.
- **Passar `showAlert` como prop drilling:** usar `useDialog()` de dentro da view ou do handler.
- **Semicolons ou double quotes:** Prettier configurado com `semi: false`, `singleQuote: true` — não infringir.

---

## Don't Hand-Roll

| Problema | Não construir | Usar em vez | Por quê |
|----------|--------------|-------------|---------|
| Estado global de dialogs | Prop drilling de `showAlert` para 15+ lugares | `React.createContext` + `useContext` | Padrão correto para estado UI global sem dependência externa |
| Roteamento | `react-router-dom` ou hash router | `type View` union existente | Produto offline sem URL; router seria 30-40 KB sem benefício |
| Mock de `window.api` em testes futuros | Re-implementar lógica nos testes | `vi.mock('../services/tickets')` | Services tornam o mock trivial quando os testes de componente chegarem na v2 |
| Typed IPC channels | Chamar `ipcRenderer.invoke('channel', ...)` direto | `window.api.*` via service | Anti-pattern documentado em ARCHITECTURE.md e CONCERNS.md |

---

## Common Pitfalls

### Pitfall 1: Quebrar o `useEffect` de keyboard shortcut

**O que dá errado:** O `useEffect` de keydown em `App.tsx:216–242` depende de 8 estados: `confirmState.open, alertState.open, modalOpen, modalNovoClienteOpen, renovarClient, view, checkoutLoading`. Ao mover estados para as views, ESLint `exhaustive-deps` pode sinalizar dependências faltando na nova estrutura.

**Por que acontece:** O hook de teclado escuta eventos que fecham modais de views diferentes — acoplamento cross-view que precisa ser resolvido antes de extrair as views.

**Como evitar:** Criar `useGlobalShortcuts` antes de extrair qualquer view. O hook recebe callbacks de cada modal aberto (via DialogProvider para alert/confirm; via props para os demais) e usa `useCallback` para estabilizar as referências.

**Sinais de alerta:** ESLint reportando `react-hooks/exhaustive-deps` após extração de view.

---

### Pitfall 2: `tickets` como estado cross-view

**O que dá errado:** `tickets` é lido em Inicio (render das cards) e em Relatorio (qtyCars para save). Após a extração, se `tickets` ficar apenas em `Inicio.tsx`, `Relatorio.tsx` não terá acesso.

**Por que acontece:** Estado de boot global tratado como estado de view local.

**Como evitar:** `tickets` permanece no `App` (ou vai para `useTickets` elevado até o App) e é passado como prop para `Inicio` e `Relatorio`. Alternativa: cada view que precisa de tickets chama `services/tickets.ts.getTickets()` no seu próprio `useEffect` — mais simples, sem prop drilling.

**Sinais de alerta:** TypeScript reclamando que `tickets` não está no escopo de `Relatorio.tsx`.

---

### Pitfall 3: Perder o refetch pós-checkout de outras views

**O que dá errado:** Em `handleCheckoutConfirm` (App.tsx:364–371), depois de finalizar um ticket, o código verifica `if (view === 'historico')` e `if (view === 'financeiro')` para refrescar essas views. Ao mover `handleCheckoutConfirm` para `Inicio.tsx`, esse acesso a `view` some — e os dados de Historico/Financeiro ficam desatualizados.

**Por que acontece:** O código original explora o estado global monolítico; após extração, cada view gerencia seu próprio ciclo de vida.

**Como evitar:** Simplesmente remover as chamadas cross-view de `handleCheckoutConfirm`. Cada view refetcha seus dados no `useEffect` do mount. Como apenas uma view é renderizada por vez, a troca de view dispara o fetch — não há dados "stale" visíveis. A Inicio não precisa saber de Historico.

**Sinais de alerta:** `setHistoryForDay`, `setHistoryLast24h`, `setFinancialHistory` sendo referenciados em `Inicio.tsx` — sinal de que o código cross-view não foi removido.

---

### Pitfall 4: Anti-pattern de print não eliminado completamente

**O que dá errado:** Mover `registerEntryWithType` e `handleCheckoutConfirm` para `Inicio.tsx` sem antes corrigir `printEntry`/`printExit` no preload resulta em `window.electron.ipcRenderer.invoke(...)` migrando para dentro da view, perpetuando o anti-pattern.

**Por que acontece:** A correção do preload (Wave 0) é pré-requisito para a extração de Inicio.

**Como evitar:** A ordem D-07 é explícita: (2) fix do preload ANTES de (4) extração de views. O planner deve garantir que o preload fix seja um commit separado e anterior ao commit de `Inicio.tsx`.

**Sinais de alerta:** `window.electron` referenciado em qualquer arquivo dentro de `views/`.

---

### Pitfall 5: `useCallback` instável no `handleBarcodeScanned`

**O que dá errado:** `handleBarcodeScanned` usa `useCallback` com deps `[view, tickets]` (App.tsx:514–531). Após mover para `Inicio.tsx`, `view` deixa de ser necessário na dep array (a view é sempre 'inicio' dentro de `Inicio.tsx`). Se esquecer de simplificar, o `useBarcodeScanner` re-registra a callback desnecessariamente.

**Como evitar:** Dentro de `Inicio.tsx`, o `useBarcodeScanner` é chamado com `enabled={true}` (a view só renderiza quando ativa), e `handleBarcodeScanned` depende apenas de `[tickets]`.

---

### Pitfall 6: `confirmState.onConfirm` contém closures de estado local

**O que dá errado:** `openCancelConfirm` e `openReativarConfirm` armazenam callbacks em `confirmState.onConfirm` que fazem `loadClients()`. Após mover para `Mensalistas.tsx` e usar `useDialog().showConfirm(...)`, a callback precisa capturar `loadClients` do escopo local da view — o que funciona, mas requer que `loadClients` seja estável via `useCallback`.

**Como evitar:** Declarar `loadClients` com `useCallback([], [])` dentro de `Mensalistas.tsx` antes de passá-la para `showConfirm`.

---

## Riscos por etapa de migração

| Etapa | Risco | Mitigação |
|-------|-------|-----------|
| 1. Criar `services/` + `types/domain.ts` | Imports quebrados se mover tipos que outros arquivos importam | Não mover nada de `App.tsx` ainda; criar novos arquivos paralelos; adaptar imports depois |
| 2. Fix preload (`printEntry`/`printExit`) | `index.d.ts` fora de sync com `index.ts` | Editar os dois arquivos no mesmo commit; typecheck:node valida imediatamente |
| 3. Criar `DialogProvider` | `AlertModal` montado duas vezes (no App e no Provider) | Remover do App no mesmo commit que cria o Provider; não fazer em etapas separadas |
| 4. Extrair `Excluidos.tsx` | Mais simples — risco mínimo | Verificar que `getExcludedTickets` move para service antes de extrair |
| 4. Extrair `Configuracoes.tsx` | Risco mínimo | Idem |
| 4. Extrair `Historico.tsx` | Moderate: 6 states, `historyDay` como dep do useEffect | Garantir que o `useEffect` com `historyDay` como dep funciona dentro da view |
| 4. Extrair `Relatorio.tsx` | Moderate: precisa de `tickets` para save | Decidir: prop ou re-fetch no momento da extração |
| 4. Extrair `Financeiro.tsx` | Moderate: `mixedTransactionsAll` precisa de `history` + `financialHistory` | Ambos ficam locais na view; aplicar `useMemo` conforme D-09 |
| 4. Extrair `Mensalistas.tsx` | Alto: 12 states, 4 modais, callbacks em confirmState | Garantir DialogProvider estável antes; testar cancelar/reativar manualmente |
| 4. Extrair `Inicio.tsx` | Mais alto: 18+ states, barcode, debtor flow, garage modal, modais inline | Última a ser extraída; todos os pré-requisitos devem estar verdes |

---

## Gates por commit (REF-03)

Cada commit deve passar os três gates antes de avançar:

```bash
# Gate 1: Tipos
npm run typecheck

# Gate 2: Linting
npm run lint

# Gate 3: Testes unitários existentes
npm test
# ou equivalente: npx vitest run

# Gate opcional (antes do build final):
npm run build
```

**Comandos verificados em `package.json`:** [VERIFIED: package.json lido]
- `npm test` → `vitest run` (inclui `__tests__/unit/calculations.test.ts` e `__tests__/unit/garageDates.test.ts`)
- `npm run typecheck` → `tsc --noEmit -p tsconfig.node.json` + `tsc --noEmit -p tsconfig.web.json`
- `npm run lint` → `eslint --cache .`

Os dois testes existentes são de `src/main/calculations.ts` e `src/main/garageDates.ts` — ambos main process, nenhum toca o renderer. Eles continuarão verdes independentemente das mudanças no renderer. [VERIFIED: vitest.config.ts — environment: 'node', include: `__tests__/**/*.test.ts`]

---

## Validation Architecture

> `workflow.nyquist_validation` não está explicitamente definido em config.json. Tratado como habilitado.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `vitest.config.ts` (raiz do projeto) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (suite única — apenas 2 arquivos) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REF-01 | Nenhum arquivo do renderer ultrapassa ~400 linhas | inspeção/grep | Ver seção "Validation Commands" abaixo | N/A (não é teste automatizado) |
| REF-02 | Zero `window.api` direto em componentes; zero `window.electron.ipcRenderer` | grep | Ver seção "Validation Commands" abaixo | N/A (grep, não teste) |
| REF-02 | `printEntry`/`printExit` expostos no preload | typecheck | `npm run typecheck` | ✅ typecheck.node cobre preload |
| REF-03 | Testes existentes verdes | unit | `npm test` | ✅ `__tests__/unit/calculations.test.ts` + `garageDates.test.ts` |
| REF-03 | Fluxo de produção validado | UAT manual | `TESTES-ANTES-DO-PENDRIVE.md` | ✅ arquivo existe |

### Validation Commands (para REF-01 e REF-02 — não são testes, são verificações de refactor)

**REF-02: verificar que nenhum component acessa window.api diretamente**

```bash
# Deve retornar zero resultados em src/renderer/src/views/ e src/renderer/src/components/
# (qualquer resultado é regressão)
grep -rn "window\.api\." src/renderer/src/views/ src/renderer/src/components/ src/renderer/src/hooks/ src/renderer/src/providers/ 2>/dev/null && echo "FALHA: window.api encontrado fora de services/" || echo "OK"
```

```bash
# Verificar anti-pattern eliminado — deve ser zero resultados em todo o renderer
grep -rn "window\.electron\.ipcRenderer" src/renderer/src/ 2>/dev/null && echo "FALHA: anti-pattern encontrado" || echo "OK"
```

**REF-01: verificar que nenhum arquivo do renderer ultrapassa 400 linhas**

```bash
# Listar todos os arquivos .tsx do renderer com contagem de linhas
find src/renderer/src -name "*.tsx" | xargs wc -l | sort -n
# Qualquer arquivo > 400 linhas precisa de avaliação
```

**REF-03: verificar que os tipos novos estão exportados corretamente**

```bash
npm run typecheck
```

### Sampling Rate

- **Por commit de view:** `npm run typecheck && npm run lint && npm test`
- **Por wave merge:** `npm run typecheck && npm run lint && npm test && npm run build`
- **Phase gate (antes de `/gsd-verify-work`):** Suite completa verde + UAT manual conforme `TESTES-ANTES-DO-PENDRIVE.md`

### Wave 0 Gaps

Não há test files a criar nesta fase (REF-03 exige manter existentes, não criar novos). Os novos arquivos de service/view não têm testes automatizados — isso é intencional e registrado como TEST-01/TEST-02 na v2.

*Infraestrutura existente cobre os testes de regressão requeridos por REF-03.*

---

## Validation Architecture: UAT Manual

O `TESTES-ANTES-DO-PENDRIVE.md` [VERIFIED: arquivo lido] cobre:

1. Instalação do .exe e atalho correto
2. Primeira execução sem erros
3. Entrada de veículo + ticket gerado
4. Saída de veículo + valor + saída salvos
5. Cadastro de mensalista + listagem
6. Impressora configurada + impressão testada
7. Dados persistentes após reinicialização

**Para esta fase de refactor, o UAT é a verificação mais importante** — nenhum desses fluxos deve regredir. O operador não nota diferença visual, mas todos os caminhos de IPC devem funcionar como antes.

---

## Project Constraints (from CLAUDE.md)

- **Sem internet em produção:** zero código com chamadas de rede; não introduzir dependências com outbound calls.
- **Atualizações por pendrive:** builds reproduzíveis offline; sem `npm install` na máquina do cliente.
- **Dados de produção não podem ser perdidos:** `parking.db` em `userData`; esta fase não toca o main process, mas qualquer mudança no preload deve ser non-breaking.
- **`parking.db` é sensível:** PII real; não commitar, não logar, não incluir em outputs.
- **UI e identificadores em pt-BR:** novos arquivos de view mantêm identifiers portugueses (`placa`, `entrada`, etc.); nomes de arquivo em PascalCase inglês (`Inicio.tsx`) conforme padrão existente dos componentes.
- **Operadores não-técnicos:** nenhuma mudança visual; refactor é puramente estrutural.
- **Commit conventions:** `refactor:` prefix para todos os commits desta fase; mensagens em inglês técnico, strings de UI em português.
- **sem `;`, single quote, 100 cols:** Prettier `.prettierrc.yaml` enforce; `npm run format` antes de cada commit.
- **Export default para componentes, named para helpers:** padrão CONVENTIONS.md — view files usam `export default function Inicio()`, service files usam `export async function getTickets()`.
- **Sem barrel files:** proibido `views/index.ts`. Cada import é direto ao arquivo.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact for This Phase |
|--------------|------------------|--------------|----------------------|
| Prop drilling de `showAlert` por toda app | React Context (`createContext` + `useContext`) | React 16+ | O `<DialogProvider>` usa a API nativa — sem biblioteca extra |
| IPC direto em componentes | Service layer tipada | Best practice Electron | Os services de esta fase implementam o padrão correto |
| `window.electron.ipcRenderer.invoke` raw | `window.api.*` via preload typed | Desde a criação do `api` object | Fix de 2 linhas no preload elimina o anti-pattern |

---

## Open Questions

1. **`tickets` em Relatorio.tsx: prop ou re-fetch?**
   - O que sabemos: Relatorio precisa de `tickets` apenas para calcular `qtyCars`/`qtyMotos` no momento do save (linha 1077 de App.tsx). É um botão que o operador clica uma vez por dia.
   - O que está em aberto: prop (App passa `tickets` para Relatorio) vs. re-fetch (Relatorio chama `getTickets()` no click do botão).
   - Recomendação: re-fetch no clique do botão — mais simples, sem prop drilling, e `tickets` muda raramente. `Relatorio.tsx` chama `services/tickets.ts.getTickets()` diretamente no handler do botão "Salvar".

2. **`useGlobalShortcuts` — implementar antes ou depois das views?**
   - O que sabemos: O efeito de teclado atual (App.tsx:216-242) depende de 8 estados de múltiplas views.
   - O que está em aberto: se o hook deve ser criado antes das extrações (recomendado em D-02) ou se os shortcuts continuam funcionando de forma simplificada no App após a extração.
   - Recomendação: Após a extração, o App só mantém `view` e o DialogProvider cuida de `alertState`/`confirmState`. Os outros estados (modalOpen, modalNovoClienteOpen, renovarClient) ficam nas views. O shortcut de Escape para esses modais pode ser tratado com `useEffect` local em cada view, em vez de um hook centralizado. Reservar `useGlobalShortcuts` para o Ctrl+N (que precisa saber qual view está ativa).

---

## Environment Availability

Esta fase é puramente código/reorganização dentro de `src/renderer/src/`. Sem dependências externas além das já instaladas.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / npm | `npm run typecheck`, `npm run lint`, `npm test` | ✅ (ambiente dev) | — | — |
| Vitest | `npm test` | ✅ | 3.2.4 | — |
| TypeScript | `npm run typecheck` | ✅ | 5.9.3 | — |
| ESLint | `npm run lint` | ✅ | 9.39.1 | — |

Nenhuma dependência faltando ou bloqueante.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A extração de `Inicio.tsx` ficará abaixo de 400 linhas mesmo com os modais inline (debtor, garage, excluirTodos, deleteClient) movidos para dentro | Estimativa de linhas | Se ultrapassar, cria subpasta `views/Inicio/` com componentes filhos — conforme regra de fallback D-01 |
| A2 | `window.api.renewSubscription` é chamado dentro de `ModalRenovar` (não em App.tsx diretamente) e portanto pertence ao service de clients sem necessidade de rastrear no App | IPC Inventory | Se ModalRenovar chamar via prop/callback que veio do App, a atribuição de service pode mudar |
| A3 | Os dois testes existentes (`calculations.test.ts`, `garageDates.test.ts`) continuarão verdes sem nenhuma mudança — eles testam main process, não renderer | Gates | Risco zero — os arquivos testados não são tocados nesta fase |

**Todas as demais afirmações neste documento foram verificadas diretamente lendo o código fonte nesta sessão.**

---

## Sources

### Primary (HIGH confidence — lidos nesta sessão)
- `src/renderer/src/App.tsx` (1839 linhas, lido integralmente) — inventário completo de state, IPC calls, view sections
- `src/preload/index.ts` — todos os 30 métodos do `api` object
- `src/preload/index.d.ts` — tipagem completa de `Window['api']`
- `.planning/phases/01-refatora-o-do-renderer/01-CONTEXT.md` — decisões e escopo
- `.planning/REQUIREMENTS.md` — REF-01, REF-02, REF-03
- `.planning/codebase/ARCHITECTURE.md` — IPC inventory, anti-patterns, data flow
- `.planning/codebase/CONVENTIONS.md` — Prettier, ESLint, naming, export patterns
- `.planning/codebase/CONCERNS.md` — fragile areas, tech debt
- `.planning/codebase/STRUCTURE.md` — directory layout, where to add new code
- `package.json` — scripts, dependency versions
- `vitest.config.ts` — test environment, include pattern
- `TESTES-ANTES-DO-PENDRIVE.md` — UAT checklist completo
- `CLAUDE.md` — project constraints

---

## Metadata

**Confidence breakdown:**
- IPC inventory: HIGH — lido diretamente de `App.tsx`, `preload/index.ts`, `preload/index.d.ts`
- State mapping: HIGH — contagem exata de `useState` em App.tsx
- Line estimates per view: MEDIUM — baseado em delimitadores lidos, não em `wc -l` por bloco
- Architecture: HIGH — patterns verificados nos arquivos existentes do projeto
- Pitfalls: HIGH — derivados de leitura direta do código e CONCERNS.md

**Research date:** 2026-05-10
**Valid until:** Não expira (pesquisa é sobre o próprio codebase; reler se App.tsx for modificado antes da execução)
