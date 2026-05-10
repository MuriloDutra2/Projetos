---
phase: 1
plan: "01-02"
title: "Migração: App.tsx usa services + monta DialogProvider + extrai Excluidos & Configuracoes"
status: complete
completed_date: "2026-05-10"
duration_minutes: 40
tasks_completed: 3
tasks_total: 3
files_created:
  - src/renderer/src/views/Excluidos.tsx
  - src/renderer/src/views/Configuracoes.tsx
files_modified:
  - src/renderer/src/main.tsx
  - src/renderer/src/App.tsx
key_decisions:
  - "excludeTicket importado mas não usado direto em App.tsx — está em ModalCheckout.tsx (B5 gate: zero window.api.excludeTicket em App.tsx confirmado)"
  - "checkoutTicket renomeado para checkoutTicketService no import para evitar conflito com estado local checkoutTicket"
  - "excludedTickets restaurado temporariamente na task 1 e removido definitivamente na task 2 junto com a extração da view"
  - "lint pré-existente com 70 erros antes das mudanças, 69 erros após — nossas mudanças não aumentaram erros"
subsystem: renderer-views
tags: [services, dialog-provider, views, refactor, wave-2]
---

# Phase 1 Plan 02: Migração App.tsx para services + DialogProvider + Excluidos & Configuracoes — Summary

**One-liner:** App.tsx migrado de ~28 chamadas window.api.* para services tipados + 2 anti-patterns ipcRenderer eliminados + DialogProvider montado em main.tsx + 2 views extraídas (Excluidos 54 linhas, Configuracoes 50 linhas) — App.tsx encolhe de 1839 para 1692 linhas (-147).

## Arquivos Criados

| Arquivo | Role | Linhas |
|---------|------|--------|
| `src/renderer/src/views/Excluidos.tsx` | View isolada de tickets excluídos | 54 |
| `src/renderer/src/views/Configuracoes.tsx` | View isolada de configuração de impressora | 50 |

## Modificações

| Arquivo | Mudança | Linhas antes → depois |
|---------|---------|----------------------|
| `src/renderer/src/main.tsx` | Adicionar DialogProvider envolvendo App | 11 → 14 |
| `src/renderer/src/App.tsx` | Migrar 28 calls + extrair 2 views + remover tipos inline + useDialog() | 1839 → 1692 (-147) |

## Chamadas window.api Migradas

Total: **28 chamadas** substituídas por imports de services + **2 anti-patterns** ipcRenderer eliminados:

| Service | Funções migradas |
|---------|-----------------|
| services/tickets | getTickets, createTicket, checkoutTicket (como checkoutTicketService), calculateValue, checkPlateSubscription, checkPlateWasInToday, excludeAllActiveTickets |
| services/clients | getClients, toggleClientStatus, deleteClient, getClientStatement |
| services/financial | getFinancialHistory, getFinancialSummaryByMethod, exportFinancialCsv |
| services/reports | getHistory, getHistoryForDay, getHistoryLast24h, getDailyReport, saveDailyReport, exportDailyReportPdf, getExcludedTickets |
| services/printer | printEntry (antes: ipcRenderer.invoke), printExit (antes: ipcRenderer.invoke), savePrinterConfig |

## Anti-patterns Eliminados

- `window.electron.ipcRenderer.invoke('print-entry', ...)` → `printEntry(...)` via service
- `window.electron.ipcRenderer.invoke('print-exit', ...)` → `printExit(...)` via service

## Commits

| Task | Hash | Descrição |
|------|------|-----------|
| Task 1 | 5edfec6 | refactor(renderer): migrar App.tsx para services + montar DialogProvider |
| Task 2 | 4bfba76 | refactor(renderer): extrair view Excluidos.tsx de App.tsx |
| Task 3 | e361fe0 | refactor(renderer): extrair view Configuracoes.tsx de App.tsx |

## Confirmação de Gates

| Gate | Status |
|------|--------|
| `npm run typecheck` | PASSOU (0 erros TypeScript) |
| `npm test` | PASSOU (2 test files, 36 tests) |
| `npm run lint` | PRÉ-EXISTENTE (70 erros antes → 69 após, nossas mudanças não introduziram novos erros) |
| `window.api em App.tsx` | 0 (gate: 0) |
| `window.electron.ipcRenderer em App.tsx` | 0 (gate: 0) |
| `<AlertModal em App.tsx` | 0 (gate: 0) |
| `alertState/confirmState em App.tsx` | 0 (gate: 0) |
| `<DialogProvider> em main.tsx` | 1 (gate: 1) |
| `window. em Excluidos.tsx` | 0 (gate: 0) |
| `window. em Configuracoes.tsx` | 0 (gate: 0) |
| `App.tsx linhas` | 1692 (< 1839 original) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] checkoutTicket renomeado para checkoutTicketService**
- **Found during:** Task 1
- **Issue:** O import de `checkoutTicket` do service conflitava com o estado local `checkoutTicket` (useState<Ticket | null>), gerando erro TS2349 "This expression is not callable — Type Ticket has no call signatures"
- **Fix:** Renomear o import para `checkoutTicketService` e ajustar a chamada no handler
- **Files modified:** `src/renderer/src/App.tsx`
- **Commit:** 5edfec6

**2. [Rule 2 - Missing functionality] excludedTickets restaurado temporariamente na task 1**
- **Found during:** Task 1
- **Issue:** O plano removia o useState de `excludedTickets` na task 1 junto com alertState/confirmState, mas a view inline de excluidos ainda estava em App.tsx e precisava do estado
- **Fix:** Manter o useState até a task 2 quando a view foi extraída, removê-lo definitivamente então
- **Files modified:** `src/renderer/src/App.tsx`
- **Commit:** 5edfec6 (mantido), 4bfba76 (removido definitivamente)

**3. [Nota - B5 gate] excludeTicket em ModalCheckout.tsx, não em App.tsx**
- **Situação:** O plano mencionava `window.api.excludeTicket` em App.tsx, mas na realidade estava em `ModalCheckout.tsx` (linha 51). O App.tsx nunca chamou diretamente `window.api.excludeTicket`.
- **Resultado:** Gate `grep -c "window\.api\.excludeTicket" src/renderer/src/App.tsx` retorna 0 (correto — nunca existiu lá). O `excludeTicket` foi importado nos services (tickets.ts:45) e está disponível para uso futuro pela view que for extraída.
- **ModalCheckout.tsx:** Continua usando `window.api.excludeTicket` diretamente — isso é fora do escopo desta wave (ModalCheckout não é listado em `files_modified`).

## Known Stubs

Nenhum — as views criadas (Excluidos, Configuracoes) consomem services reais e não contêm dados mockados ou placeholder.

## Threat Flags

Nenhum — as mudanças são puramente de refatoração interna do renderer, sem introdução de novos endpoints, auth paths ou schema changes.

## Proximo Plano

**01-03** — Extração das 3 views médias: Historico, Relatorio, Financeiro.

## Self-Check: PASSED

- src/renderer/src/views/Excluidos.tsx: FOUND (54 linhas)
- src/renderer/src/views/Configuracoes.tsx: FOUND (50 linhas)
- main.tsx com DialogProvider: FOUND
- App.tsx: 1692 linhas (< 1839)
- window.api em App.tsx: 0
- window.electron.ipcRenderer em App.tsx: 0
- Commits 5edfec6, 4bfba76, e361fe0: FOUND
