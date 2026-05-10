# Phase 1: Refatoração do Renderer - Pattern Map

**Mapped:** 2026-05-10
**Files analyzed:** 21 new/modified files
**Analogs found:** 21 / 21

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/renderer/src/types/domain.ts` | types | — | `src/renderer/src/App.tsx` lines 27–88 (inline type block) | exact — move, not rewrite |
| `src/renderer/src/services/types.ts` | types | — | `src/preload/index.d.ts` (return-type declarations) | exact — re-exports domain.ts |
| `src/renderer/src/services/tickets.ts` | service | request-response | `src/preload/index.ts` lines 33–44 (createTicket/checkoutTicket pattern) | exact |
| `src/renderer/src/services/clients.ts` | service | CRUD | `src/preload/index.ts` lines 45–77 (getClients/createClient/updateClient block) | exact |
| `src/renderer/src/services/plates.ts` | service | request-response | `src/preload/index.ts` lines 41–44 (checkPlateSubscription/checkPlateWasInToday) | exact |
| `src/renderer/src/services/financial.ts` | service | CRUD | `src/preload/index.ts` lines 75–79 (getFinancialHistory/getFinancialSummaryByMethod) | exact |
| `src/renderer/src/services/reports.ts` | service | CRUD | `src/preload/index.ts` lines 6–32 (getDailyReport/saveDailyReport/exportDailyReportPdf) | exact |
| `src/renderer/src/services/printer.ts` | service | request-response | `src/preload/index.ts` lines 80–93 (getPrinters/printSubscription) + App.tsx:346/440 (anti-patterns) | exact |
| `src/renderer/src/providers/DialogProvider.tsx` | provider | event-driven | `src/renderer/src/components/AlertModal.tsx` (modal props pattern) + App.tsx:153–164 (alertState/confirmState) | role-match |
| `src/renderer/src/views/Excluidos.tsx` | component | request-response | `src/renderer/src/App.tsx` lines 1445–1480 (excluidos view block) | exact — extract |
| `src/renderer/src/views/Configuracoes.tsx` | component | request-response | `src/renderer/src/App.tsx` lines 1482–1514 (configuracoes view block) | exact — extract |
| `src/renderer/src/views/Historico.tsx` | component | request-response | `src/renderer/src/App.tsx` lines 919–1018 (historico view block) | exact — extract |
| `src/renderer/src/views/Relatorio.tsx` | component | request-response | `src/renderer/src/App.tsx` lines 1020–1133 (relatorio view block) | exact — extract |
| `src/renderer/src/views/Financeiro.tsx` | component | CRUD + transform | `src/renderer/src/App.tsx` lines 1338–1443 + lines 393–423 (mixedTransactions) | exact — extract |
| `src/renderer/src/views/Mensalistas.tsx` | component | CRUD | `src/renderer/src/App.tsx` lines 1135–1336 + modal handlers | exact — extract |
| `src/renderer/src/views/Inicio.tsx` | component | event-driven | `src/renderer/src/App.tsx` lines 691–917 + handlers 282–531 | exact — extract |
| `src/renderer/src/hooks/useTickets.ts` | hook | event-driven | `src/renderer/src/hooks/useBarcodeScanner.ts` (useEffect + cleanup pattern) + App.tsx:244–250 (loadTickets) | role-match |
| `src/renderer/src/hooks/useClients.ts` | hook | CRUD | `src/renderer/src/hooks/useBarcodeScanner.ts` (useEffect pattern) + App.tsx:262–270 (loadClients) | role-match |
| `src/renderer/src/hooks/useFinancial.ts` | hook | CRUD | `src/renderer/src/hooks/useBarcodeScanner.ts` (useEffect + deps pattern) + App.tsx:273–280 | role-match |
| `src/renderer/src/hooks/useDailyReport.ts` | hook | request-response | `src/renderer/src/hooks/useBarcodeScanner.ts` (useEffect + deps) + App.tsx:191–193 | role-match |
| `src/renderer/src/hooks/useGlobalShortcuts.ts` | hook | event-driven | `src/renderer/src/hooks/useBarcodeScanner.ts` lines 50–93 (window.addEventListener + cleanup) + App.tsx:216–242 | exact |
| `src/preload/index.ts` | config | — | `src/preload/index.ts` lines 1–93 (existing api object) | exact — additive |
| `src/preload/index.d.ts` | config | — | `src/preload/index.d.ts` lines 1–105 (Window['api'] interface) | exact — additive |

---

## Pattern Assignments

### `src/renderer/src/types/domain.ts` (types)

**Analog:** `src/renderer/src/App.tsx` lines 27–88

**Core types to move** (App.tsx lines 27–88):
```typescript
// Move these verbatim from App.tsx — do not rewrite, just relocate
export interface Ticket {
  id: number
  placa: string
  tipo: string
  entrada: string
  status: string
}

export interface HistoryEntry {
  id: number
  placa: string
  tipo: string
  entrada: string
  saida: string
  valor: number
}

export interface ClientRow {
  id: number
  name: string
  cpf?: string
  phone?: string
  plan_type: string
  expiry_date: string
  status: string
  plates: string[]
  isExpired: boolean
  isDebtor?: boolean
  lastPaymentDate?: string | null
  lastPaymentCompetency?: string | null
  financialStatus?: 'Em dia' | 'Vence hoje' | 'A vencer' | 'Em atraso' | string
  garage_billing_day?: number | null
  garage_billing_month?: number | null
  garageBillingLabel?: string | null
}

export interface SubscriptionInfo {
  isSubscriber: boolean
  clientName: string
  planType: string
  isExpired: boolean
  expiryDate: string
  freeMinutes: number
  isDebtor?: boolean
  clientId?: number
}

export interface ClientStatement {
  client: { id: number; name: string; plan_type: string }
  payments: {
    id: number
    amount: number
    payment_date: string
    payment_method: string
    competency_month?: string | null
    is_advance: number
  }[]
  avulsoWhileDebtor: { id: number; placa: string; saida: string; valor: number }[]
  totals: { payments: number; avulsos: number }
}

export type View = 'inicio' | 'historico' | 'relatorio' | 'mensalistas' | 'financeiro' | 'excluidos' | 'configuracoes'
```

**Convention:** Named exports only (CONVENTIONS.md: named export para helpers/types). No `export default` in this file.

---

### `src/renderer/src/services/types.ts` (types, re-export)

**Analog:** `src/preload/index.d.ts`

**Core pattern** — thin re-export file:
```typescript
// Re-export all domain types so services and views can import from a single location
export type { Ticket, HistoryEntry, ClientRow, SubscriptionInfo, ClientStatement, View } from '../types/domain'
```

**Convention:** Named re-exports only. No logic, no `window.api` calls, no React.

---

### `src/renderer/src/services/tickets.ts` (service, request-response)

**Analog:** `src/preload/index.ts` lines 33–44, `src/preload/index.d.ts` lines 37–50

**Import pattern:**
```typescript
import type { Ticket, SubscriptionInfo } from '../types/domain'
```

**Core service pattern** — thin typed wrapper, named exports, no state:
```typescript
// Each function is a named async export wrapping exactly one window.api call.
// Return type is explicit — copied from index.d.ts declarations.
export async function getTickets(): Promise<Ticket[]> {
  return window.api.getTickets()
}

export async function createTicket(data: {
  placa: string
  tipo: string
}): Promise<{ success: boolean; id?: number; entrada?: string; billedAsAvulso?: boolean; error?: string; message?: string }> {
  return window.api.createTicket(data)
}

export async function checkoutTicket(data: {
  id: number
}): Promise<{ success: boolean; valor?: number; error?: string }> {
  return window.api.checkoutTicket(data)
}

export async function calculateValue(data: {
  entrada: string
  placa?: string
  tipo?: string
}): Promise<{ valor: number }> {
  return window.api.calculateValue(data)
}

export async function checkPlateSubscription(placa: string): Promise<SubscriptionInfo & { clientId?: number }> {
  return window.api.checkPlateSubscription(placa)
}

export async function checkPlateWasInToday(placa: string): Promise<boolean> {
  return window.api.checkPlateWasInToday(placa)
}

export async function excludeTicket(data: {
  id: number
  password: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.excludeTicket(data)
}

export async function excludeAllActiveTickets(data: {
  password: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.excludeAllActiveTickets(data)
}
```

**Rule:** `window.api` is only called here — never in views, hooks, or components.

---

### `src/renderer/src/services/clients.ts` (service, CRUD)

**Analog:** `src/preload/index.ts` lines 45–77, `src/preload/index.d.ts` lines 51–73

**Import pattern:**
```typescript
import type { ClientRow, ClientStatement } from '../types/domain'
```

**Core service pattern** (same thin-wrapper structure as tickets.ts):
```typescript
export async function getClients(): Promise<ClientRow[]> {
  return window.api.getClients()
}

export async function createClient(data: {
  name: string; cpf: string; phone: string; plan_type: string
  expiry_date: string; plates: string[]
  garage_billing_day?: number | null; garage_billing_month?: number | null
}): Promise<{ success: boolean; id?: number; error?: string }> {
  return window.api.createClient(data)
}

export async function updateClient(data: {
  id: number; name: string; cpf: string; phone: string; plan_type: string
  expiry_date: string; plates: string[]
  garage_billing_day?: number | null; garage_billing_month?: number | null
}): Promise<{ success: boolean; error?: string }> {
  return window.api.updateClient(data)
}

export async function toggleClientStatus(data: {
  clientId: number; active: number
}): Promise<{ success: boolean; error?: string }> {
  return window.api.toggleClientStatus(data)
}

export async function deleteClient(data: {
  clientId: number; password: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.deleteClient(data)
}

export async function getClientStatement(clientId: number): Promise<ClientStatement | null> {
  return window.api.getClientStatement(clientId)
}

export async function renewSubscription(data: {
  clientId: number; planType: string; amount: number
  months?: number; paymentMethod?: string; notes?: string
}): Promise<{ success: boolean; newExpiry?: string; error?: string }> {
  return window.api.renewSubscription(data)
}
```

---

### `src/renderer/src/services/plates.ts` (service, request-response)

**Analog:** `src/preload/index.ts` lines 41–44

**Core service pattern:**
```typescript
import type { SubscriptionInfo } from '../types/domain'

export async function checkPlateSubscription(placa: string): Promise<SubscriptionInfo & { clientId?: number }> {
  return window.api.checkPlateSubscription(placa)
}

export async function checkPlateWasInToday(placa: string): Promise<boolean> {
  return window.api.checkPlateWasInToday(placa)
}
```

**Note:** These two functions are also in `services/tickets.ts` since the RESEARCH.md assigns them there. `services/plates.ts` is an alternative if the planner prefers domain grouping by entity rather than by caller. Confirm with CONTEXT.md D-02 which grouping to use — D-02 lists `plates.ts` as a separate file, so keep the separation: `tickets.ts` owns transactional IPC, `plates.ts` owns plate-lookup IPC.

---

### `src/renderer/src/services/financial.ts` (service, CRUD)

**Analog:** `src/preload/index.ts` lines 75–79, `src/preload/index.d.ts` lines 74–75

**Core service pattern:**
```typescript
export async function getFinancialHistory(): Promise<any[]> {
  return window.api.getFinancialHistory()
}

export async function getFinancialSummaryByMethod(data: {
  month: number; year: number
}): Promise<{ payment_method: string; total: number }[]> {
  return window.api.getFinancialSummaryByMethod(data)
}

export async function exportFinancialCsv(): Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }> {
  return window.api.exportFinancialCsv()
}
```

---

### `src/renderer/src/services/reports.ts` (service, CRUD)

**Analog:** `src/preload/index.ts` lines 6–32, `src/preload/index.d.ts` lines 11–36

**Core service pattern:**
```typescript
export async function getHistory(): Promise<any[]> {
  return window.api.getHistory()
}

export async function getHistoryForDay(dateStr: string): Promise<any[]> {
  return window.api.getHistoryForDay(dateStr)
}

export async function getHistoryLast24h(): Promise<any[]> {
  return window.api.getHistoryLast24h()
}

export async function getDailyReport(dateStr: string): Promise<{
  totalAvulsos: number; planosVendidosCount: number; planosVendidosValue: number
  saved: { qtyCars: number; qtyMotos: number; createdAt: string } | null
}> {
  return window.api.getDailyReport(dateStr)
}

export async function saveDailyReport(data: {
  dateStr: string; totalAvulsos: number; planosVendidosCount: number
  planosVendidosValue: number; qtyCars: number; qtyMotos: number
}): Promise<{ success: boolean; error?: string }> {
  return window.api.saveDailyReport(data)
}

export async function exportDailyReportPdf(data: {
  dateStr: string; totalAvulsos: number; planosVendidosCount: number
  planosVendidosValue: number; qtyCars: number; qtyMotos: number; savedAt?: string
}): Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }> {
  return window.api.exportDailyReportPdf(data)
}

export async function getExcludedTickets(): Promise<{
  id: number; placa: string; tipo: string; entrada: string; saida: string
}[]> {
  return window.api.getExcludedTickets()
}

export async function excludeAllActiveTickets(data: {
  password: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.excludeAllActiveTickets(data)
}
```

---

### `src/renderer/src/services/printer.ts` (service, request-response)

**Analog:** `src/preload/index.ts` lines 80–93 + App.tsx lines 340–358 and 438–451 (anti-patterns to replace)

**Core service pattern** — includes the two new methods that must be added to preload first:
```typescript
// After preload fix: printEntry and printExit are available on window.api
export async function printEntry(data: {
  id: number; placa: string; entrada: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.printEntry(data)
}

export async function printExit(data: {
  placa: string; entrada: string; saida: string; valor: number; tempoTotal: string
}): Promise<{ success: boolean; error?: string }> {
  return window.api.printExit(data)
}

export async function printSubscription(data: {
  clientData: { name: string; cpf: string; phone: string }
  vehicleList: string[]
  planData: { planName: string; value: number; expiryDate: string }
}): Promise<{ success: boolean; error?: string }> {
  return window.api.printSubscription(data)
}

export async function getPrinters(): Promise<{ name: string; displayName: string }[]> {
  return window.api.getPrinters()
}

export async function getPrinterConfig(): Promise<string> {
  return window.api.getPrinterConfig()
}

export async function savePrinterConfig(printerName: string): Promise<{ success: boolean }> {
  return window.api.savePrinterConfig(printerName)
}
```

**Preload fix required before using `printEntry`/`printExit`** — see Shared Patterns section.

---

### `src/renderer/src/providers/DialogProvider.tsx` (provider, event-driven)

**Analog:** `src/renderer/src/components/AlertModal.tsx` (props contract) + App.tsx lines 153–164 (state shape) + App.tsx lines 425–427 (showAlert function)

**Import pattern** (AlertModal.tsx line 1 as reference):
```typescript
import { createContext, useContext, useState } from 'react'
import AlertModal from '../components/AlertModal'
```

**State shape** (from App.tsx lines 153–164):
```typescript
// alertState shape — copy from App.tsx:153–158
{ open: boolean; title: string; message: string; type: 'error' | 'success' }

// confirmState shape — copy from App.tsx:159–164
{ open: boolean; title: string; message: string; onConfirm: () => void }
```

**Context + hook pattern:**
```typescript
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
```

**Component export pattern** (matches CONVENTIONS.md: default export for components):
```typescript
export default function DialogProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  // alertState and confirmState here
  // showAlert and showConfirm handlers here
  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
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
    </DialogContext.Provider>
  )
}
```

**AlertModal props contract** (AlertModal.tsx lines 3–12):
```typescript
// AlertModal accepts: isOpen, title, message, type, onClose, confirmMode?, onConfirm?, confirmLabel?
// The onConfirm callback is called then onClose is called inside AlertModal (line 59-61)
```

---

### `src/renderer/src/views/Excluidos.tsx` (component, request-response)

**Analog:** App.tsx lines 1445–1480 (direct extraction)

**Import pattern** — minimum for this view:
```typescript
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { getExcludedTickets } from '../services/reports'
```

**Component structure** (default export, view-local state, fetch on mount):
```typescript
export default function Excluidos(): React.JSX.Element {
  const [excludedTickets, setExcludedTickets] = useState<{
    id: number; placa: string; tipo: string; entrada: string; saida: string
  }[]>([])

  useEffect(() => {
    getExcludedTickets().then(setExcludedTickets)
  }, [])

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* JSX from App.tsx lines 1447–1479 verbatim, replacing window.api calls with service calls */}
    </div>
  )
}
```

**JSX pattern to copy** (App.tsx lines 1446–1479):
- Outer wrapper: `<div className="flex-1 p-6 overflow-y-auto">`
- Table with `bg-gray-800 border border-gray-700 rounded-lg overflow-hidden`
- `<thead>` row: `border-b border-gray-700 bg-gray-700/50`, `th` with `text-sm font-semibold text-gray-300`
- Empty state: `<td colSpan={4}` with `text-center text-gray-500`
- Row hover: `hover:bg-gray-700/30`

---

### `src/renderer/src/views/Configuracoes.tsx` (component, request-response)

**Analog:** App.tsx lines 1482–1514 (direct extraction)

**Import pattern:**
```typescript
import { useState, useEffect } from 'react'
import { getPrinters, getPrinterConfig, savePrinterConfig } from '../services/printer'
import { useDialog } from '../providers/DialogProvider'
```

**Component structure:**
```typescript
export default function Configuracoes(): React.JSX.Element {
  const { showAlert } = useDialog()
  const [printers, setPrinters] = useState<{ name: string; displayName: string }[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState('')

  useEffect(() => {
    getPrinters().then(setPrinters)
    getPrinterConfig().then(setSelectedPrinter)
  }, [])

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* JSX from App.tsx lines 1483–1513 — replace window.api.savePrinterConfig with savePrinterConfig() */}
      {/* Replace showAlert() call with useDialog().showAlert() */}
    </div>
  )
}
```

**Key JSX pattern** (App.tsx lines 1485–1511):
- Card: `bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md`
- Save button: `bg-red-600 hover:bg-red-700 rounded-lg font-medium text-white`

---

### `src/renderer/src/views/Historico.tsx` (component, request-response)

**Analog:** App.tsx lines 919–1018 (direct extraction) + App.tsx lines 183–209 (useEffect for view)

**Import pattern:**
```typescript
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { getHistoryForDay, getHistoryLast24h } from '../services/reports'
import type { HistoryEntry } from '../types/domain'
```

**Component structure** — state local, fetch in useEffect with deps:
```typescript
export default function Historico(): React.JSX.Element {
  const [historyDay, setHistoryDay] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [historyForDay, setHistoryForDay] = useState<HistoryEntry[]>([])
  const [historyLast24h, setHistoryLast24h] = useState<HistoryEntry[]>([])
  const [historicoFiltro24h, setHistoricoFiltro24h] = useState(false)
  const [searchHistoricoPlaca, setSearchHistoricoPlaca] = useState('')

  useEffect(() => {
    if (historicoFiltro24h) {
      getHistoryLast24h().then(setHistoryLast24h)
    } else {
      getHistoryForDay(historyDay).then(setHistoryForDay)
    }
  }, [historyDay, historicoFiltro24h])  // No longer depends on `view` — always active when rendered

  // JSX from App.tsx lines 919–1018
}
```

**Pattern note:** The `useEffect` in App.tsx (line 183) guards with `if (view === 'historico')`. After extraction, the guard disappears — the component only renders when active, so the effect runs unconditionally on mount and on dep changes.

---

### `src/renderer/src/views/Relatorio.tsx` (component, request-response)

**Analog:** App.tsx lines 1020–1133 (direct extraction)

**Import pattern:**
```typescript
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { getDailyReport, saveDailyReport, exportDailyReportPdf } from '../services/reports'
import { getTickets } from '../services/tickets'
import { useDialog } from '../providers/DialogProvider'
```

**Component structure** — tickets re-fetched on save click (RESEARCH.md Open Question 1 resolution):
```typescript
export default function Relatorio(): React.JSX.Element {
  const { showAlert } = useDialog()
  const [reportDay, setReportDay] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [dailyReport, setDailyReport] = useState<{ ... } | null>(null)

  useEffect(() => {
    getDailyReport(reportDay).then(setDailyReport)
  }, [reportDay])

  const handleSave = async () => {
    // Re-fetch tickets at click time — simpler than prop drilling
    const currentTickets = await getTickets()
    const qtyCars = currentTickets.filter((t) => t.tipo === 'Carro' || t.tipo === 'MENSALISTA').length
    const qtyMotos = currentTickets.filter((t) => t.tipo === 'Moto').length
    // ... rest of save logic from App.tsx:1073–1099
  }
}
```

---

### `src/renderer/src/views/Financeiro.tsx` (component, CRUD + transform)

**Analog:** App.tsx lines 1338–1443 (direct extraction) + App.tsx lines 393–423 (mixedTransactions logic)

**Import pattern:**
```typescript
import { useState, useEffect, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'
import { getFinancialHistory, getFinancialSummaryByMethod, exportFinancialCsv } from '../services/financial'
import { getHistory } from '../services/reports'
import { useDialog } from '../providers/DialogProvider'
import type { HistoryEntry } from '../types/domain'
```

**useMemo pattern for mixedTransactions** (D-09 micro-debt fix, from App.tsx lines 393–423):
```typescript
// history = avulso exits, financialHistory = subscription payments
const mixedTransactionsAll = useMemo(() => [
  ...history.filter((h) => h.saida).map((h) => ({
    date: h.saida,
    type: 'avulso' as const,
    description: `Ticket ${h.placa}`,
    value: h.valor ?? 0
  })),
  ...financialHistory.map((p) => ({
    date: p.payment_date,
    type: 'renovacao' as const,
    description: `Renovação - ${p.client_name}${p.payment_method ? ` (${p.payment_method})` : ''}`,
    value: p.amount ?? 0
  }))
].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [history, financialHistory])
```

**Month filter pattern** (App.tsx lines 393–396):
```typescript
const filterDate = new Date(financeFilterYear, financeFilterMonth - 1, 1)
const monthStart = startOfMonth(filterDate)
const monthEnd = endOfMonth(filterDate)
const inMonth = (d: string) => isWithinInterval(new Date(d), { start: monthStart, end: monthEnd })
```

---

### `src/renderer/src/views/Mensalistas.tsx` (component, CRUD)

**Analog:** App.tsx lines 1135–1336 + handlers 502–592

**Import pattern:**
```typescript
import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { clsx } from 'clsx'
import {
  getClients, toggleClientStatus, getClientStatement, deleteClient
} from '../services/clients'
import ModalNovoCliente, { type ClientToEdit } from '../components/ModalNovoCliente'
import ModalRenovar from '../components/ModalRenovar'
import { useDialog } from '../providers/DialogProvider'
import { friendlyError } from '../utils/errorHandler'
import type { ClientRow, ClientStatement } from '../types/domain'
```

**loadClients as useCallback** (Pitfall 6 mitigation from RESEARCH.md):
```typescript
const loadClients = useCallback(async () => {
  try {
    const data = await getClients()
    setClients(data)
  } catch (e) {
    console.error(e)
    setClients([])
    showAlert('Erro', 'Erro ao carregar mensalistas. Tente novamente.', 'error')
  }
}, [showAlert])  // showAlert is stable from context
```

**openCancelConfirm pattern** — useDialog replaces prop drilling (App.tsx lines 553–563):
```typescript
const openCancelConfirm = (c: ClientRow) => {
  showConfirm(
    'Cancelar plano',
    `Deseja cancelar o plano de ${c.name}? O cliente perderá o acesso imediato.`,
    async () => {
      const res = await toggleClientStatus({ clientId: c.id, active: 0 })
      if (res.success) loadClients()
      else showAlert('Erro', friendlyError(res.error ?? 'Não foi possível cancelar'), 'error')
    }
  )
}
```

**Modal usage pattern** (from App.tsx lines 1537–1543):
```typescript
<ModalNovoCliente
  open={modalNovoClienteOpen}
  onClose={() => { setModalNovoClienteOpen(false); setClientToEdit(null) }}
  onSuccess={loadClients}
  onAlert={showAlert}
  clientToEdit={clientToEdit}
/>
```

---

### `src/renderer/src/views/Inicio.tsx` (component, event-driven)

**Analog:** App.tsx lines 691–917 + handlers 282–531 + inline modals 1707–1792

**Import pattern:**
```typescript
import { useState, useEffect, useCallback } from 'react'
import { format, differenceInMinutes } from 'date-fns'
import { clsx } from 'clsx'
import {
  getTickets, createTicket, checkoutTicket, calculateValue,
  checkPlateSubscription, excludeAllActiveTickets
} from '../services/tickets'
import { checkPlateWasInToday } from '../services/plates'
import { printEntry, printExit } from '../services/printer'
import ModalCheckout from '../components/ModalCheckout'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { useDialog } from '../providers/DialogProvider'
import { maskPlate, plateToRaw } from '../utils/masks'
import { friendlyError } from '../utils/errorHandler'
import type { Ticket, SubscriptionInfo } from '../types/domain'
import type { View } from '../types/domain'
import logoImg from '../assets/logo.png'
```

**Props interface** — receives setView for debtor→mensalistas redirect:
```typescript
interface InicioProps {
  setView: (v: View) => void
}

export default function Inicio({ setView }: InicioProps): React.JSX.Element {
```

**useBarcodeScanner usage** (Pitfall 5 fix — `enabled={true}` inside the view, simpler deps):
```typescript
// Inside Inicio, view is always 'inicio' — no need to check
useBarcodeScanner(handleBarcodeScanned, true)

// handleBarcodeScanned deps are just [tickets] not [view, tickets]
const handleBarcodeScanned = useCallback((value: string) => {
  const scanned = plateToRaw(value)
  if (!scanned) return
  const ticket = tickets.find((t) => plateToRaw(t.placa ?? '') === scanned)
  if (ticket) {
    setPlaca('')
    setSearchPlacaList('')
    void handleCheckoutClick(ticket)
  } else {
    showAlert('Placa não encontrada', `Nenhum veículo estacionado com "${maskPlate(scanned)}"`, 'error')
  }
}, [tickets])  // No `view` in deps — always 'inicio' in this component
```

**Print anti-pattern replacement** — use service, not ipcRenderer directly:
```typescript
// BEFORE (App.tsx:440) — ANTI-PATTERN:
// window.electron.ipcRenderer.invoke('print-entry', { id, placa, entrada })

// AFTER — via service:
const printRes = await printEntry({ id: result.id, placa: plate.toUpperCase(), entrada: result.entrada ?? new Date().toISOString() })
if (printRes && !printRes.success) {
  showAlert('Erro de impressão', friendlyError(printRes.error ?? 'printer'), 'error')
}
```

**Cross-view refetch removal** (Pitfall 3 fix — App.tsx lines 364–371):
```typescript
// REMOVE from handleCheckoutConfirm — these calls cross view boundaries:
// if (view === 'historico') { getHistoryLast24h()... }
// if (view === 'financeiro') { loadHistory(); loadFinancialHistory() }
// Each view refetches on mount when user navigates to it — no cross-view needed
```

---

### `src/renderer/src/hooks/useTickets.ts` (hook, event-driven)

**Analog:** `src/renderer/src/hooks/useBarcodeScanner.ts` (useEffect + cleanup + useCallback) + App.tsx lines 244–250 (loadTickets) + App.tsx lines 211–213 (setInterval re-render)

**Import pattern:**
```typescript
import { useState, useEffect, useCallback } from 'react'
import { getTickets } from '../services/tickets'
import type { Ticket } from '../types/domain'
```

**Core hook pattern** — D-09 fix: `useState<number>` tick replaces `setTickets((p) => [...p])` clone hack:
```typescript
export function useTickets(): { tickets: Ticket[]; reload: () => Promise<void> } {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [tick, setTick] = useState(0)  // D-09: tick counter forces re-render without cloning array

  const reload = useCallback(async () => {
    try {
      const data = await getTickets()
      setTickets(data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    // Tick every 60s to refresh elapsed time display — D-09 fix
    const t = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  return { tickets, reload, tick }  // tick exposed so views can use as render dep
}
```

**Pattern source:** `useBarcodeScanner.ts` lines 25–94 — same pattern of `useEffect` with cleanup `return () => clearInterval(t)`.

---

### `src/renderer/src/hooks/useClients.ts` (hook, CRUD)

**Analog:** `useBarcodeScanner.ts` (useEffect + callback pattern) + App.tsx lines 262–270 (loadClients)

**Import pattern:**
```typescript
import { useState, useCallback } from 'react'
import { getClients } from '../services/clients'
import type { ClientRow } from '../types/domain'
```

**Core hook pattern** — simpler than useTickets (no interval):
```typescript
export function useClients(): { clients: ClientRow[]; reload: () => Promise<void>; loading: boolean } {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getClients()
      setClients(data)
    } catch (e) {
      console.error(e)
      setClients([])
    } finally {
      setLoading(false)
    }
  }, [])

  return { clients, reload, loading }
}
```

---

### `src/renderer/src/hooks/useFinancial.ts` (hook, CRUD)

**Analog:** `useBarcodeScanner.ts` (useEffect with deps) + App.tsx lines 273–280 + lines 396–403

**Import pattern:**
```typescript
import { useState, useEffect, useCallback } from 'react'
import { getFinancialHistory, getFinancialSummaryByMethod } from '../services/financial'
import { getHistory } from '../services/reports'
import type { HistoryEntry } from '../types/domain'
```

**Core hook pattern** — re-fetches when month/year change:
```typescript
export function useFinancial(month: number, year: number): {
  history: HistoryEntry[]
  financialHistory: any[]
  financialByMethod: { payment_method: string; total: number }[]
  reload: () => void
} {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [financialHistory, setFinancialHistory] = useState<any[]>([])
  const [financialByMethod, setFinancialByMethod] = useState<{ payment_method: string; total: number }[]>([])

  const reload = useCallback(() => {
    getHistory().then(setHistory).catch(console.error)
    getFinancialHistory().then(setFinancialHistory).catch(console.error)
    getFinancialSummaryByMethod({ month, year }).then(setFinancialByMethod).catch(console.error)
  }, [month, year])

  useEffect(() => {
    reload()
  }, [reload])

  return { history, financialHistory, financialByMethod, reload }
}
```

---

### `src/renderer/src/hooks/useDailyReport.ts` (hook, request-response)

**Analog:** `useBarcodeScanner.ts` (useEffect with deps) + App.tsx lines 191–193

**Core hook pattern:**
```typescript
import { useState, useEffect } from 'react'
import { getDailyReport } from '../services/reports'

export function useDailyReport(dateStr: string): {
  dailyReport: {
    totalAvulsos: number; planosVendidosCount: number; planosVendidosValue: number
    saved: { qtyCars: number; qtyMotos: number; createdAt: string } | null
  } | null
  reload: () => void
} {
  const [dailyReport, setDailyReport] = useState<... | null>(null)

  const reload = () => getDailyReport(dateStr).then(setDailyReport).catch(console.error)

  useEffect(() => {
    reload()
  }, [dateStr])

  return { dailyReport, reload }
}
```

---

### `src/renderer/src/hooks/useGlobalShortcuts.ts` (hook, event-driven)

**Analog:** `src/renderer/src/hooks/useBarcodeScanner.ts` lines 50–93 (window.addEventListener + cleanup) + App.tsx lines 216–242 (onKeyDown effect)

**Import pattern:**
```typescript
import { useEffect } from 'react'
```

**Core hook pattern** — accepts callbacks instead of reading state directly (RESEARCH.md Pitfall 1 fix):
```typescript
interface GlobalShortcutsOptions {
  view: string
  onEscape?: () => void        // called by DialogProvider context — not needed here
  onCtrlN?: () => void         // open ModalNovoCliente when view === 'mensalistas'
}

export function useGlobalShortcuts({ view, onCtrlN }: GlobalShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (view === 'mensalistas' && onCtrlN) {
          onCtrlN()
        }
      }
      // Escape is handled locally by each modal (useEffect in view) or by AlertModal's own onClose
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, onCtrlN])  // useBarcodeScanner.ts line 93 pattern: deps in useEffect dep array
}
```

**Pattern source — cleanup pattern** (`useBarcodeScanner.ts` lines 88–93):
```typescript
window.addEventListener('keydown', handleKeyDown, true)
return () => {
  window.removeEventListener('keydown', handleKeyDown, true)
  reset()
}
```

---

### `src/preload/index.ts` (config, additive modification)

**Analog:** `src/preload/index.ts` lines 1–93 (existing file)

**Additive change** — add two entries to the `api` object (lines 88–92, after `printSubscription`):
```typescript
// Add to the api object in src/preload/index.ts:
printEntry: (data: { id: number; placa: string; entrada: string }) =>
  ipcRenderer.invoke('print-entry', data),
printExit: (data: { placa: string; entrada: string; saida: string; valor: number; tempoTotal: string }) =>
  ipcRenderer.invoke('print-exit', data),
```

**Pattern source:** Any existing entry in the `api` object (e.g., line 35: `checkoutTicket: (data: { id: number }) => ipcRenderer.invoke('checkout-ticket', data)`).

---

### `src/preload/index.d.ts` (config, additive modification)

**Analog:** `src/preload/index.d.ts` lines 1–105 (existing file)

**Additive change** — add two method signatures to `Window['api']` interface (after line 102, before closing `}`):
```typescript
// Add to Window['api'] in src/preload/index.d.ts:
printEntry: (data: { id: number; placa: string; entrada: string }) => Promise<{ success: boolean; error?: string }>
printExit: (data: { placa: string; entrada: string; saida: string; valor: number; tempoTotal: string }) => Promise<{ success: boolean; error?: string }>
```

**Pattern source:** `printSubscription` declaration at line 98–102 — same shape.

---

## Shared Patterns

### services/ thin-wrapper rule
**Source:** `src/preload/index.ts` (entire file — the api object is the authoritative contract)
**Apply to:** All 7 service files
```typescript
// Every function in services/ follows this exact shape:
export async function <methodName>(<params with types>): Promise<<return type from index.d.ts>> {
  return window.api.<methodName>(<params>)
}
// No try/catch in services — callers handle errors
// No React state in services — pure functions
```

### useDialog() — replacing showAlert prop drilling
**Source:** `src/renderer/src/providers/DialogProvider.tsx` (to be created)
**Apply to:** All 7 view files + any component that calls showAlert
```typescript
// Inside a view or component:
const { showAlert, showConfirm } = useDialog()
// Then: showAlert('Título', 'Mensagem', 'error' | 'success')
// Replaces: onAlert?.('Título', 'Mensagem', 'error') or props.showAlert(...)
```

### useEffect fetch on mount — view-local data loading
**Source:** App.tsx lines 183–209 (per-view guards), simplified after extraction
**Apply to:** All 7 view files
```typescript
// Pattern: mount fetch, dep-array driven refresh, no view guard needed
useEffect(() => {
  getExcludedTickets().then(setExcludedTickets)
}, [])  // [] = fetch once on mount; add deps if re-fetch is needed on state change
```

### clsx conditional classes
**Source:** `src/renderer/src/components/AlertModal.tsx` line 34, `src/renderer/src/components/ModalCheckout.tsx` — implicit (not used there, but sidebar buttons use it)
**Apply to:** All view files that have conditional class logic
```typescript
import { clsx } from 'clsx'
// Usage: className={clsx('base-classes', condition && 'conditional-class', { 'key': bool })}
```

### Error handling in handlers
**Source:** App.tsx lines 375–380 (handleCheckoutConfirm catch block)
**Apply to:** All async handlers in view files
```typescript
try {
  // async call
} catch (err) {
  console.error(err)
  showAlert('Erro', friendlyError(err), 'error')
}
```

**friendlyError source:** `src/renderer/src/utils/errorHandler.ts` — imported by all views that have error handling.

### `if (!open) return null` — modal guard
**Source:** `src/renderer/src/components/AlertModal.tsx` line 24, `ModalCheckout.tsx` line 41, `ModalNovoCliente.tsx` line 121
**Apply to:** Any inline modal JSX inside views (debtorDecisionOpen, statementOpen, garageEntryModal, deleteClientModal, modalExcluirTodosOpen in Inicio/Mensalistas)
```typescript
// For inline modals rendered conditionally in views:
{debtorDecisionOpen && pendingEntry && (
  <div className="fixed inset-0 ...">...</div>
)}
// Prefer conditional render with && over early-return for inline JSX blocks
```

### Dark theme palette
**Source:** Throughout App.tsx, AlertModal.tsx, ModalCheckout.tsx, ModalNovoCliente.tsx
**Apply to:** All view files
```
Backgrounds: bg-gray-900 (page), bg-gray-800 (cards/sidebar), bg-gray-700 (inputs)
Borders:     border-gray-700, border-gray-600
Text:        text-white (primary), text-gray-300 (secondary), text-gray-400 (labels), text-gray-500 (hints)
Primary action: bg-red-600 hover:bg-red-700 (brand color — matches logo)
Success:     bg-green-600 hover:bg-green-500
Destructive: bg-red-600 hover:bg-red-500 (same as primary — pt-BR context)
Disabled:    disabled:bg-gray-600 disabled:cursor-not-allowed
```

### Export conventions (CONVENTIONS.md D-06)
**Apply to:** Every new file
```typescript
// View files — default export:
export default function Excluidos(): React.JSX.Element { ... }

// Service files — named exports only:
export async function getExcludedTickets(): Promise<...> { ... }

// Hook files — named exports only:
export function useTickets(): { ... } { ... }

// Type files — named exports only:
export interface Ticket { ... }
export type View = ...

// NO semicolons, single quotes, 100-char line limit (Prettier enforces)
// NO barrel files (no index.ts in views/, services/, hooks/, providers/)
```

---

## Preload Fix — Required Before View Extraction

### Preload anti-pattern to eliminate
**Source:** App.tsx lines 346 and 440 — `window.electron.ipcRenderer.invoke('print-exit', ...)` and `window.electron.ipcRenderer.invoke('print-entry', ...)`

**Two-file atomic change:**
1. `src/preload/index.ts` — add `printEntry` and `printExit` to the `api` object
2. `src/preload/index.d.ts` — add declarations to `Window['api']`
3. In same commit: `src/renderer/src/services/printer.ts` already wraps them (created in Wave 0)

**Validation:** `npm run typecheck` covers both files via `tsconfig.node.json` (preload) and `tsconfig.web.json` (renderer). Both must pass in the same commit.

---

## No Analog Found

All 21 files have analogs from the existing codebase. No files require RESEARCH.md patterns as primary reference.

| File | Analog quality note |
|------|---------------------|
| `src/renderer/src/providers/DialogProvider.tsx` | Context/Provider pattern not yet in codebase — use RESEARCH.md code example as supplement, but AlertModal.tsx props are the concrete anchor |
| `src/renderer/src/hooks/useGlobalShortcuts.ts` | `useBarcodeScanner.ts` is the structural analog; App.tsx lines 216–242 provide the business logic |

---

## Metadata

**Analog search scope:** `src/renderer/src/` (App.tsx, components/, hooks/, utils/), `src/preload/`
**Files read:** 8 source files (App.tsx — 4 targeted ranges, AlertModal.tsx, ModalCheckout.tsx, ModalNovoCliente.tsx, useBarcodeScanner.ts, masks.ts, preload/index.ts, preload/index.d.ts)
**Pattern extraction date:** 2026-05-10
