---
phase: 01-refatora-o-do-renderer
reviewed: 2026-05-12T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - src/preload/index.d.ts
  - src/preload/index.ts
  - src/renderer/src/App.tsx
  - src/renderer/src/hooks/useGlobalShortcuts.ts
  - src/renderer/src/hooks/useTickets.ts
  - src/renderer/src/providers/DialogProvider.tsx
  - src/renderer/src/services/clients.ts
  - src/renderer/src/services/financial.ts
  - src/renderer/src/services/reports.ts
  - src/renderer/src/services/tickets.ts
  - src/renderer/src/services/types.ts
  - src/renderer/src/types/domain.ts
  - src/renderer/src/views/Configuracoes.tsx
  - src/renderer/src/views/Excluidos.tsx
  - src/renderer/src/views/Financeiro.tsx
  - src/renderer/src/views/Historico.tsx
  - src/renderer/src/views/Inicio.tsx
  - src/renderer/src/views/Mensalistas/DeleteClientModal.tsx
  - src/renderer/src/views/Mensalistas/MensalistasTabela.tsx
  - src/renderer/src/views/Mensalistas/StatementModal.tsx
  - src/renderer/src/views/Mensalistas/index.tsx
  - src/renderer/src/views/Relatorio.tsx
findings:
  critical: 4
  warning: 9
  info: 4
  total: 17
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-05-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

This phase extracted views and hooks out of a monolithic `App.tsx` into separate files and introduced a service layer. The architecture is sound — the separation of concerns is correct and the IPC boundary typing is thorough. However, the review uncovered four blockers, all related to unguarded `new Date()` calls on untrusted data arriving from SQLite/IPC (will throw in production on any `null` or malformed timestamp), one missing error boundary around the async confirm callback, and a logic gap where `onCtrlN` being recreated on every render causes unnecessary event-listener churn. Nine warnings cover missing error propagation, unhandled rejection patterns, a stale-closure risk, and several type-safety gaps that `any[]` return types leave open.

---

## Critical Issues

### CR-01: `new Date(t.saida)` called unconditionally — crashes when `saida` is `null`

**File:** `src/renderer/src/views/Excluidos.tsx:44`

**Issue:** The `saida` column in excluded tickets can be `null` (the IPC type declares it as `string` but the DB column is nullable). The `format(new Date(null), ...)` call produces `Invalid Date` and `date-fns/format` throws a `RangeError: Invalid time value`, which crashes the entire `Excluidos` view with no error boundary in sight. The same pattern recurs in `StatementModal.tsx:63` where `t.saida` is also rendered via `format(new Date(t.saida), ...)`.

```tsx
// BEFORE (Excluidos.tsx:44) — crashes when saida is null
<td className="px-4 py-3 text-gray-300">
  {t.saida ? format(new Date(t.saida), 'dd/MM/yyyy HH:mm') : '—'}
</td>
```

The `t.saida` guard on line 44 looks correct at first glance but the TypeScript type in `getExcludedTickets()` return (`src/preload/index.d.ts:27`) declares `saida: string`, which is a lie — the underlying table stores `NULL` for tickets that are still active when excluded. The guard is present but the **`ClientStatement.avulsoWhileDebtor`** items in `StatementModal.tsx:63` have no such guard:

```tsx
// StatementModal.tsx:63 — no guard; crashes on null saida
{t.placa} - {format(new Date(t.saida), 'dd/MM/yyyy HH:mm')} - R$ ...
```

**Fix:**
```tsx
// StatementModal.tsx:63
{t.placa} - {t.saida ? format(new Date(t.saida), 'dd/MM/yyyy HH:mm') : '—'} - R$ ...
```

And tighten the IPC type in `index.d.ts` to match reality:
```ts
avulsoWhileDebtor: { id: number; placa: string; tipo: string; entrada: string; saida: string | null; valor: number }[]
```

---

### CR-02: Unhandled exception in `showConfirm` callback crashes silently

**File:** `src/renderer/src/providers/DialogProvider.tsx:59-62` and `src/renderer/src/views/Mensalistas/index.tsx:91-96, 103-108`

**Issue:** `showConfirm` stores an `onConfirm: () => void` callback but the actual callbacks passed in `openCancelConfirm` and `openReativarConfirm` are `async` functions (they call `toggleClientStatus` via IPC). The `DialogProvider` fires `onConfirm` without `await` and without wrapping it in a try/catch. If the IPC call rejects, the rejection is unhandled — Electron surfaces this as an uncaught promise rejection, and the UI gives no feedback to the operator.

```tsx
// DialogProvider.tsx — onConfirm is called but rejection is never caught
onConfirm={confirmState.onConfirm}
```

The `confirmMode` `AlertModal` presumably calls `props.onConfirm()` on button click. Because the callback is async and the call site doesn't `await` or `.catch()`, any throw disappears.

**Fix:**

Change the `showConfirm` type signature to accept `() => Promise<void> | void` and wrap the invocation in `AlertModal`/the provider:

```tsx
// DialogProvider.tsx — wrap the call site
const handleConfirm = async (): Promise<void> => {
  try {
    await confirmState.onConfirm()
  } catch (err) {
    console.error('Confirm callback threw:', err)
    // Optionally surface via showAlert
  } finally {
    setConfirmState((s) => ({ ...s, open: false }))
  }
}
```

And update the interface:
```ts
interface DialogContextValue {
  showAlert: (title: string, message: string, type: 'error' | 'success') => void
  showConfirm: (title: string, message: string, onConfirm: () => Promise<void> | void) => void
}
```

---

### CR-03: `format(new Date(c.expiry_date), ...)` and `format(new Date(c.lastPaymentDate), ...)` throw on invalid/null values in `MensalistasTabela`

**File:** `src/renderer/src/views/Mensalistas/MensalistasTabela.tsx:96, 100`

**Issue:** `c.expiry_date` is typed as non-optional `string` in `ClientRow` but arrives from SQLite where the value can be empty string or malformed. If the main process ever returns a row with a missing or corrupted `expiry_date`, `new Date('')` produces `Invalid Date` and `date-fns/format` throws, crashing the entire Mensalistas table. `c.lastPaymentDate` is typed `string | null` but the guard at line 99 (`c.lastPaymentDate ?`) handles that; however `c.expiry_date` has no guard.

```tsx
// MensalistasTabela.tsx:96 — no guard against invalid date string
{format(new Date(c.expiry_date), 'dd/MM/yyyy')}
```

**Fix:**
```tsx
{c.expiry_date ? format(new Date(c.expiry_date), 'dd/MM/yyyy') : '—'}
```

Also apply defensive wrapping to `format(new Date(dailyReport.saved.createdAt), ...)` in `Relatorio.tsx:63` and `format(new Date(p.payment_date), ...)` in `StatementModal.tsx:49` for the same reason.

---

### CR-04: `openStatement` swallows IPC errors — operator sees a blank modal instead of an error

**File:** `src/renderer/src/views/Mensalistas/index.tsx:123-127`

**Issue:** `openStatement` is `async` but has no try/catch. If `getClientStatement` rejects (IPC error, DB locked, etc.), the unhandled rejection is swallowed, `statementOpen` is still set to `true`, and the operator sees a modal with "Nenhum dado encontrado" — they have no indication that an error occurred. In a production parking environment, the operator may repeatedly click the button thinking the data is just empty.

```ts
// index.tsx:123-127 — no error handling
const openStatement = async (c: ClientRow): Promise<void> => {
  const data = await getClientStatement(c.id)
  setStatementData(data as ClientStatement | null)
  setStatementOpen(true)
}
```

**Fix:**
```ts
const openStatement = async (c: ClientRow): Promise<void> => {
  try {
    const data = await getClientStatement(c.id)
    setStatementData(data as ClientStatement | null)
    setStatementOpen(true)
  } catch (err) {
    console.error(err)
    showAlert('Erro', 'Não foi possível carregar o extrato. Tente novamente.', 'error')
  }
}
```

---

## Warnings

### WR-01: `onCtrlN` callback reference changes every render, causing the event listener to be torn down and re-registered on every `App` render

**File:** `src/renderer/src/App.tsx:18-21` / `src/renderer/src/hooks/useGlobalShortcuts.ts:23`

**Issue:** `onCtrlN` is passed as an inline arrow function `() => mensalistasRef.current?.openNewClientModal()`. Arrow functions defined in JSX are recreated on every render. `useGlobalShortcuts` lists `onCtrlN` in its dependency array (`[view, onCtrlN]`), so the `removeEventListener` + `addEventListener` pair fires on every parent render (counter updates, state changes in `Inicio`, etc.). While not data-corrupting, it introduces jitter and is a correctness smell — the listener is briefly absent during the tear-down cycle.

**Fix:** Wrap the callback in `useCallback` in `App.tsx`:
```tsx
const handleCtrlN = useCallback(() => {
  mensalistasRef.current?.openNewClientModal()
}, []) // mensalistasRef is stable

useGlobalShortcuts({ view, onCtrlN: handleCtrlN })
```

---

### WR-02: `Relatorio.tsx` — "Salvar relatório" button handler has no try/catch; an IPC error leaves `loading` state undefined

**File:** `src/renderer/src/views/Relatorio.tsx:79-97`

**Issue:** The inline `async` click handler calls `getDailyReport`, `getTickets`, `saveDailyReport`, and `getDailyReport` again, none wrapped in try/catch. Any IPC rejection (DB locked, main process busy) throws an uncaught promise rejection. There is no loading state guard, so the button remains clickable during the async work and double-clicks can fire multiple concurrent saves.

**Fix:** Wrap the entire handler body in try/catch and introduce a loading flag:
```tsx
const [saving, setSaving] = useState(false)
// ...
onClick={async () => {
  if (saving) return
  setSaving(true)
  try {
    const report = await getDailyReport(reportDay)
    // ... rest of logic
  } catch (err) {
    showAlert('Erro', friendlyError(err), 'error')
  } finally {
    setSaving(false)
  }
}}
disabled={saving || reportDay !== format(new Date(), 'yyyy-MM-dd')}
```

---

### WR-03: `Financeiro.tsx` — `exportFinancialCsv` click handler has no try/catch

**File:** `src/renderer/src/views/Financeiro.tsx:96-100`

**Issue:** The export button's `onClick` is an async arrow that `await`s `exportFinancialCsv()` without try/catch. An IPC rejection propagates as an unhandled promise rejection; the operator receives no feedback.

**Fix:**
```tsx
onClick={async () => {
  try {
    const res = await exportFinancialCsv()
    if (res.success && res.path) showAlert('Exportado', `Arquivo salvo em ${res.path}`, 'success')
    else if (!res.canceled && res.error) showAlert('Erro', friendlyError(res.error), 'error')
  } catch (err) {
    showAlert('Erro', friendlyError(err), 'error')
  }
}}
```

---

### WR-04: `Configuracoes.tsx` — `handleSave` silently fails if `savePrinterConfig` rejects

**File:** `src/renderer/src/views/Configuracoes.tsx:15-18`

**Issue:** `handleSave` `await`s `savePrinterConfig` and immediately shows a success alert without checking the return value (`{ success: boolean }`). If the IPC call throws, the error is unhandled. If it returns `{ success: false }`, the user still sees "Configuração atualizada".

**Fix:**
```tsx
const handleSave = async (): Promise<void> => {
  try {
    const res = await savePrinterConfig(selectedPrinter)
    if (res.success) {
      showAlert('Salvo', 'Configuração de impressora atualizada.', 'success')
    } else {
      showAlert('Erro', 'Não foi possível salvar a configuração.', 'error')
    }
  } catch (err) {
    showAlert('Erro', friendlyError(err), 'error')
  }
}
```

---

### WR-05: `DialogProvider.tsx` — `showAlert` and `showConfirm` are not memoized; new references on every render break downstream `useCallback`/`useMemo` dependencies

**File:** `src/renderer/src/providers/DialogProvider.tsx:36-41`

**Issue:** `showAlert` and `showConfirm` are plain arrow functions defined in the component body. They are recreated on every render of `DialogProvider`. Any component that lists `showAlert` in a `useCallback` dependency array (e.g., `useTickets`, `Mensalistas/index.tsx:54`) will have its callback invalidated on every provider re-render, causing cascading re-subscriptions. In `Mensalistas/index.tsx:54`, `loadClients` depends on `showAlert` — meaning `loadClients` is recreated whenever `DialogProvider` state changes (i.e., whenever any alert/confirm dialog opens or closes), which in turn re-fires the `useEffect` that calls `loadClients()`.

**Fix:** Wrap both functions in `useCallback`:
```tsx
const showAlert = useCallback((title: string, message: string, type: 'error' | 'success'): void => {
  setAlertState({ open: true, title, message, type })
}, [])

const showConfirm = useCallback((title: string, message: string, onConfirm: () => void): void => {
  setConfirmState({ open: true, title, message, onConfirm })
}, [])
```

---

### WR-06: `Mensalistas/index.tsx` — `loadClients` re-fetches the full client list every time any dialog opens or closes (caused by WR-05 above)

**File:** `src/renderer/src/views/Mensalistas/index.tsx:45-54, 56-58`

**Issue:** `loadClients` is memoized with `useCallback([showAlert])`. Because `showAlert` changes reference on every `DialogProvider` state change (each alert/confirm open/close), `loadClients` is recreated on every dialog interaction, which triggers the `useEffect` on line 56-58 to re-call `loadClients()`. This means every time the operator confirms a cancel-plan or reactivate action (which opens a dialog to show the success message), the full client list is fetched from IPC a second time redundantly. This is a correctness/UX issue: the reload fires at an unpredictable time relative to the operation completing.

**Fix:** Resolve by fixing WR-05 (memoize `showAlert`), or remove `showAlert` from `loadClients` dependencies and use a ref:
```ts
const showAlertRef = useRef(showAlert)
showAlertRef.current = showAlert

const loadClients = useCallback(async (): Promise<void> => {
  try {
    const data = await getClients()
    setClients(data)
  } catch (e) {
    console.error(e)
    setClients([])
    showAlertRef.current('Erro', 'Erro ao carregar mensalistas. Tente novamente.', 'error')
  }
}, []) // no showAlert dependency
```

---

### WR-07: `services/financial.ts` and `services/reports.ts` — return type `Promise<any[]>` loses all type safety at the service boundary

**File:** `src/renderer/src/services/financial.ts:1`, `src/renderer/src/services/reports.ts:1-3`

**Issue:** `getFinancialHistory()` returns `Promise<any[]>` and `getHistory()`, `getHistoryForDay()`, `getHistoryLast24h()` all return `Promise<any[]>`. The `HistoryEntry` type already exists in `domain.ts`. Callers (e.g., `Financeiro.tsx:18`) type their state as `any[]`, which means all field accesses (`p.payment_date`, `p.client_name`, `p.amount`) are unchecked — a renamed column from main or a schema change would fail silently at runtime with no compile-time warning.

**Fix:**
```ts
// reports.ts
export async function getHistory(): Promise<HistoryEntry[]> {
  return window.api.getHistory()
}
// etc.

// financial.ts — define or import a FinancialEntry type
export interface FinancialEntry {
  id: number
  client_name: string
  amount: number
  payment_date: string
  payment_method: string
}
export async function getFinancialHistory(): Promise<FinancialEntry[]> {
  return window.api.getFinancialHistory()
}
```

Also update `index.d.ts` to use typed arrays instead of `any[]` for `getFinancialHistory` and `getHistory`.

---

### WR-08: `Inicio.tsx` — `handleBarcodeScanned` captures a stale `handleCheckoutClick` reference

**File:** `src/renderer/src/views/Inicio.tsx:223-238`

**Issue:** `handleBarcodeScanned` is memoized with `useCallback([tickets, showAlert])`. However, `handleCheckoutClick` (called inside via `void handleCheckoutClick(ticket)`) is **not** in the dependency array and is not itself memoized — it is recreated on every render. The `handleBarcodeScanned` callback always sees the version of `handleCheckoutClick` that existed when it was last reconstructed (when `tickets` or `showAlert` changed). If `checkoutValor` or `checkoutTicket` state changes between scans in an unexpected order, the captured closure over `handleCheckoutClick` could be stale. More concretely: `handleCheckoutClick` closes over `setCheckoutValor`, `setCheckoutTicket`, and `setModalOpen` — all of which are stable React setters, so in practice the stale-closure bug is dormant today. But if `handleCheckoutClick` is ever extended to close over other state, this will silently misbehave.

**Fix:** Either include `handleCheckoutClick` in the `useCallback` deps (after memoizing it with `useCallback`) or restructure so the checkout logic lives in a `useCallback` that is passed as a dep:
```tsx
const handleCheckoutClick = useCallback(async (ticket: Ticket) => { ... }, [calculateValue])
// then
const handleBarcodeScanned = useCallback((value: string) => { ... }, [tickets, showAlert, handleCheckoutClick])
```

---

### WR-09: `preload/index.d.ts` — `getClients`, `getHistory`, `getFinancialHistory` typed as `Promise<any[]>` leak untyped data into the renderer

**File:** `src/preload/index.d.ts:7-8, 51, 74`

**Issue:** Three IPC channels are declared with `any[]` return types. This is the root cause of the `any` propagation noted in WR-07. TypeScript provides no protection against field name mismatches between the main process DB query and the renderer field accesses.

**Fix:** Replace each `any[]` with the appropriate domain type (use the types from `domain.ts` or mirror them in the preload declaration):
```ts
getTickets: () => Promise<Ticket[]>      // Ticket already in domain.ts
getHistory: () => Promise<HistoryEntry[]>
getClients: () => Promise<ClientRow[]>
getFinancialHistory: () => Promise<FinancialEntry[]>
```

---

## Info

### IN-01: `competenciaLabel` is duplicated across two files

**File:** `src/renderer/src/views/Mensalistas/MensalistasTabela.tsx:15-19` and `src/renderer/src/views/Mensalistas/StatementModal.tsx:9-13`

**Issue:** Identical four-line `competenciaLabel` function is copy-pasted into both files. If the format requirement changes (e.g., full year display), both copies must be updated in sync.

**Fix:** Extract to `src/renderer/src/utils/formatters.ts` and import from both files.

---

### IN-02: `Inicio.tsx` — `handleBarcodeScanned` missing `handleCheckoutClick` in displayed `useCallback` deps triggers ESLint `exhaustive-deps` warning

**File:** `src/renderer/src/views/Inicio.tsx:223`

**Issue:** The `useCallback` dependency array `[tickets, showAlert]` omits `handleCheckoutClick`, which will be flagged by `react-hooks/exhaustive-deps` lint rule if it is enabled. Even if the rule is not currently enforced, the gap is a maintenance hazard.

**Fix:** See WR-08 for the full resolution.

---

### IN-03: `services/types.ts` is a passthrough re-export with no added value

**File:** `src/renderer/src/services/types.ts`

**Issue:** The file contains a single line re-exporting everything from `../types/domain`. It serves no architectural purpose and adds an indirection layer. Any caller who imports from `services/types` would get the same types from `types/domain` directly.

**Fix:** Remove `services/types.ts` and update any imports that reference it to point directly to `../types/domain`.

---

### IN-04: `Relatorio.tsx` — hardcoded price table in UI ("R$ 60,00", "R$ 50,00", "R$ 75,00")

**File:** `src/renderer/src/views/Relatorio.tsx:71-74`

**Issue:** Subscription prices are hardcoded in the rendered "Tabela atual de mensalistas" block. When prices change (which happens at a real client site), this display will silently show stale values, potentially confusing the operator.

**Fix:** Extract prices to a constants file (e.g., `src/renderer/src/constants/pricing.ts`) shared with any other price-display logic, so a single change propagates everywhere. Mark with a `// TODO: phase-X — make prices configurable` comment if a full settings screen is out of scope now.

---

_Reviewed: 2026-05-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
