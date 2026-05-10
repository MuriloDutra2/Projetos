---
phase: 1
plan: "01-01"
title: "Foundation: tipos, services, preload fix, DialogProvider"
status: complete
completed_date: "2026-05-10"
duration_minutes: 25
tasks_completed: 3
tasks_total: 3
files_created:
  - src/renderer/src/types/domain.ts
  - src/renderer/src/services/types.ts
  - src/renderer/src/services/tickets.ts
  - src/renderer/src/services/clients.ts
  - src/renderer/src/services/plates.ts
  - src/renderer/src/services/financial.ts
  - src/renderer/src/services/reports.ts
  - src/renderer/src/services/printer.ts
  - src/renderer/src/providers/DialogProvider.tsx
files_modified:
  - src/preload/index.ts
  - src/preload/index.d.ts
key_decisions:
  - "Tipos duplicados em App.tsx e domain.ts são temporários — wave 2 migra os imports"
  - "clients.ts tem 7 exports (incluindo renewSubscription) — RESEARCH.md estava desatualizado, fonte autoritativa é index.d.ts"
  - "checkPlateSubscription e checkPlateWasInToday aparecem em tickets.ts e plates.ts intencionalmente (D-02)"
  - "financial.ts usa Promise<any[]> para getFinancialHistory — paridade com index.d.ts atual (T-01-03 accepted)"
subsystem: renderer-foundation
tags: [services, types, preload, provider, refactor]
---

# Phase 1 Plan 01: Foundation — tipos, services, preload fix, DialogProvider — Summary

**One-liner:** Camada de services tipada (7 arquivos) + tipos de domínio centralizados + printEntry/printExit no preload via `window.api` + DialogProvider com `useDialog()` — fundação para extração de views nas waves seguintes.

## Arquivos Criados

| Arquivo | Role | Exports |
|---------|------|---------|
| `src/renderer/src/types/domain.ts` | Tipos de domínio — fonte única | 6 (Ticket, HistoryEntry, ClientRow, SubscriptionInfo, ClientStatement, View) |
| `src/renderer/src/services/types.ts` | Re-export de domain.ts | 6 (re-export) |
| `src/renderer/src/services/tickets.ts` | Wrappers IPC de tickets | 8 (getTickets, createTicket, checkoutTicket, calculateValue, checkPlateSubscription, checkPlateWasInToday, excludeTicket, excludeAllActiveTickets) |
| `src/renderer/src/services/clients.ts` | Wrappers IPC de clientes | **7** (getClients, createClient, updateClient, toggleClientStatus, deleteClient, getClientStatement, **renewSubscription**) |
| `src/renderer/src/services/plates.ts` | Wrappers IPC de placa | 2 (checkPlateSubscription, checkPlateWasInToday) |
| `src/renderer/src/services/financial.ts` | Wrappers IPC financeiros | 3 (getFinancialHistory, getFinancialSummaryByMethod, exportFinancialCsv) |
| `src/renderer/src/services/reports.ts` | Wrappers IPC de relatórios | 8 (getHistory, getHistoryForDay, getHistoryLast24h, getDailyReport, saveDailyReport, exportDailyReportPdf, getExcludedTickets, excludeAllActiveTickets) |
| `src/renderer/src/services/printer.ts` | Wrappers IPC de impressora | 6 (printEntry, printExit, printSubscription, getPrinters, getPrinterConfig, savePrinterConfig) |
| `src/renderer/src/providers/DialogProvider.tsx` | Context provider alert/confirm | default DialogProvider + named useDialog |

## Modificações no Preload

**src/preload/index.ts** — adicionado ao objeto `api` (após `printSubscription`):
```typescript
printEntry: (data: { id: number; placa: string; entrada: string }) =>
  ipcRenderer.invoke('print-entry', data),
printExit: (data: { placa: string; entrada: string; saida: string; valor: number; tempoTotal: string }) =>
  ipcRenderer.invoke('print-exit', data)
```

**src/preload/index.d.ts** — adicionado à interface `Window['api']`:
```typescript
printEntry: (data: { id: number; placa: string; entrada: string }) => Promise<{ success: boolean; error?: string }>
printExit: (data: { placa: string; entrada: string; saida: string; valor: number; tempoTotal: string }) => Promise<{ success: boolean; error?: string }>
```

## Confirmação de Gates

| Gate | Status |
|------|--------|
| `npm run typecheck` | PASSOU (0 erros TS em todos os arquivos novos e modificados) |
| `npm run lint` (novos arquivos) | PASSOU (0 erros nos arquivos criados/modificados) |
| `npm test` | PASSOU (2 test files, 36 tests — calculations + garageDates) |
| App.tsx intocado | CONFIRMADO |
| Sem barrel index.ts em services/ ou providers/ | CONFIRMADO |
| window.electron em services/ | 0 matches |
| ipcRenderer em services/ | 0 matches |

## Commits

| Task | Hash | Descrição |
|------|------|-----------|
| Task 1 | 49fdba0 | refactor(renderer): criar tipos de domínio e re-export |
| Task 2 | 5fe8976 | refactor(renderer): adicionar printEntry/printExit ao preload tipado |
| Task 3 | c801754 | refactor(renderer): criar 7 services tipados + DialogProvider |

## Deviations from Plan

Nenhuma — plano executado exatamente como descrito.

## Known Stubs

Nenhum — todos os services são wrappers funcionais que chamam `window.api.*` diretamente. Nenhum valor hardcoded ou placeholder.

## Proximo Plano

**01-02** — Migração das call sites de App.tsx + extração das views menores (Excluidos, Configuracoes) e restantes views.

## Self-Check: PASSED

- src/renderer/src/types/domain.ts: FOUND
- src/renderer/src/services/types.ts: FOUND
- src/renderer/src/services/tickets.ts: FOUND (8 exports)
- src/renderer/src/services/clients.ts: FOUND (7 exports, renewSubscription presente)
- src/renderer/src/services/plates.ts: FOUND
- src/renderer/src/services/financial.ts: FOUND
- src/renderer/src/services/reports.ts: FOUND
- src/renderer/src/services/printer.ts: FOUND
- src/renderer/src/providers/DialogProvider.tsx: FOUND
- Commits 49fdba0, 5fe8976, c801754: FOUND
