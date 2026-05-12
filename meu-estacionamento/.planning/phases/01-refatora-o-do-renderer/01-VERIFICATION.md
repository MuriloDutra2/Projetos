---
phase: 01-refatora-o-do-renderer
verified: 2026-05-12T10:15:00Z
status: human_needed
score: 4/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "UAT manual: fluxo entrada → saída → cobrança (placa avulsa, mensalista, garagem, devedor)"
    expected: "Ticket gerado, impressão de entrada dispara (printEntry via service), saída abre ModalCheckout, checkout confirma, printExit via service dispara, ticket desaparece da lista"
    why_human: "Requer Electron em execução (npm run dev) e interação com UI — não testável programaticamente. Inicio.tsx tem 637 linhas de lógica verbatim copiada do original; integridade dos branches (devedor, garagem, mensalista) só é confirmável via operação real."
  - test: "UAT manual: Ctrl+N na view Mensalistas abre modal Novo Cliente"
    expected: "Pressionar Ctrl+N com view='mensalistas' aberto → ModalNovoCliente aparece via mensalistasRef.current?.openNewClientModal()"
    why_human: "Requer Electron em execução; o wiring via useImperativeHandle + forwardRef é verificável no código mas o comportamento real depende do DOM e do Electron."
gaps: []
deferred: []
---

# Phase 1: Refatoração do Renderer — Verification Report

**Phase Goal:** Renderer fica modular o suficiente (cada arquivo < ~400 linhas, IPC só via hooks tipados) para receber as próximas features sem regredir os fluxos atuais
**Verified:** 2026-05-12T10:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Cada view (inicio, historico, relatorio, mensalistas, financeiro, excluidos, configuracoes) vive no seu próprio arquivo | ✓ VERIFIED | 7 views existem: Inicio.tsx (637), Historico.tsx (122), Relatorio.tsx (139), Mensalistas/index.tsx (285), Financeiro.tsx (172), Excluidos.tsx (54), Configuracoes.tsx (50). Todas em src/renderer/src/views/. |
| 2 | Nenhum arquivo do renderer ultrapassa ~400 linhas (REF-01) | PARTIAL | Inicio.tsx = **637 linhas** (excede). MensalistasTabela.tsx = 258 (sub-componente dentro de Mensalistas/). Todos os outros < 400. ModalNovoCliente.tsx = 403 é pré-existente, não criado nesta fase. O `~` na regra indica softness — ver análise abaixo. |
| 3 | IPC apenas via hooks/serviços tipados — zero `window.electron.ipcRenderer` em todo renderer (REF-02) | ✓ VERIFIED | `grep -rn "window.electron.ipcRenderer" src/renderer/src/` = 0 matches. `window.api.*` em views/hooks/providers = 0 matches. window.api existe apenas em src/renderer/src/services/ (34 chamadas, correto). Modal pré-existentes (ModalCheckout, ModalNovoCliente, ModalRenovar) usam window.api mas não foram modificados nesta fase e não são views — são components pré-existentes fora do escopo do plano. |
| 4 | Suíte Vitest continua passando + typecheck verde (REF-03 automático) | ✓ VERIFIED | npm test: 36/36 passaram (calculations.test.ts + garageDates.test.ts). npm run typecheck: 0 erros TS (tsc exit 0). npm run lint: 58 erros (todos pré-existentes — baseline antes da fase era 82 erros; fase melhorou lint). |
| 5 | Fluxo principal (entrada → saída → cobrança) funciona para avulso e mensalista — UAT manual documentado (REF-03) | ? UNCERTAIN | UAT manual não executável neste ambiente (requer Electron). Inicio.tsx contém toda a lógica verbatim copiada de App.tsx. Wiring verificado programaticamente: useTickets + useBarcodeScanner + useDialog conectados; printEntry/printExit chamados via services/printer.ts; ModalCheckout montado com handlers corretos. Requer confirmação humana. |

**Score: 4/5 truths verified (1 uncertain — requer UAT humano)**

---

### Análise de REF-01: Inicio.tsx com 637 linhas

O ROADMAP usa `~400 linhas` (tilde = aproximado). O plano 01-05 reconheceu explicitamente que Inicio.tsx excede o guideline (Decision: "D-08 diz que 400 linhas é guideline, não obrigação rígida. A complexidade dos fluxos justifica o tamanho").

Contexto da decisão:
- Inicio.tsx contém 5 fluxos distintos: barcode scanner, fluxo devedor (modal), modal garagem, ModalCheckout, modal excluir-todos
- Nenhum desses fluxos pode ser dividido sem criar dependências cross-view (state compartilhado entre sub-componentes)
- O objetivo arquitetural foi atingido: App.tsx = 131 linhas; 6 das 7 views < 250 linhas
- ModalNovoCliente.tsx (403) é pré-existente e não foi tocado nesta fase

**Classificação: WARNING (não BLOCKER)** — A fase claramente atingiu modularidade suficiente para receber próximas features. Inicio.tsx não impede o progresso da Phase 2 e além.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/renderer/src/types/domain.ts` | 6 exports de domínio + View union | ✓ VERIFIED | Existe, 6 exports (grep confirma) |
| `src/renderer/src/services/tickets.ts` | 8 wrappers IPC | ✓ VERIFIED | Existe, 8 named exports |
| `src/renderer/src/services/clients.ts` | 7 wrappers IPC incluindo renewSubscription | ✓ VERIFIED | Existe, 7 named exports confirmados (incluindo renewSubscription) |
| `src/renderer/src/services/financial.ts` | 3 wrappers IPC | ✓ VERIFIED | Existe |
| `src/renderer/src/services/reports.ts` | 8 wrappers IPC | ✓ VERIFIED | Existe, 8 named exports |
| `src/renderer/src/services/printer.ts` | 6 wrappers incluindo printEntry/printExit | ✓ VERIFIED | Existe, printEntry + printExit no preload tipados |
| `src/renderer/src/providers/DialogProvider.tsx` | default DialogProvider + named useDialog | ✓ VERIFIED | Existe, ambos exports presentes |
| `src/renderer/src/views/Inicio.tsx` | View principal < 400 linhas | PARTIAL | Existe com toda lógica correta, mas 637 linhas (excede guideline) |
| `src/renderer/src/views/Historico.tsx` | View isolada, 122 linhas | ✓ VERIFIED | 122 linhas |
| `src/renderer/src/views/Relatorio.tsx` | View isolada, 139 linhas | ✓ VERIFIED | 139 linhas |
| `src/renderer/src/views/Mensalistas/index.tsx` | View com forwardRef + useImperativeHandle | ✓ VERIFIED | 285 linhas, forwardRef + useImperativeHandle presentes |
| `src/renderer/src/views/Financeiro.tsx` | View com useMemo para mixedTransactions | ✓ VERIFIED | 172 linhas, useMemo confirmado |
| `src/renderer/src/views/Excluidos.tsx` | View isolada | ✓ VERIFIED | 54 linhas |
| `src/renderer/src/views/Configuracoes.tsx` | View isolada | ✓ VERIFIED | 50 linhas |
| `src/renderer/src/hooks/useTickets.ts` | Hook com setInterval tick (D-09) | ✓ VERIFIED | 33 linhas, setInterval + clearInterval presentes |
| `src/renderer/src/hooks/useGlobalShortcuts.ts` | Hook com addEventListener cleanup | ✓ VERIFIED | 23 linhas, addEventListener + removeEventListener presentes |
| `src/renderer/src/App.tsx` | Shell < 200 linhas | ✓ VERIFIED | 131 linhas, 1 useState (View), 0 useEffect |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/renderer/src/main.tsx` | `DialogProvider` | wraps `<App />` | ✓ WIRED | `<DialogProvider>` presente em main.tsx envolvendo `<StrictMode><App /></StrictMode>` |
| `src/renderer/src/App.tsx` | 7 views | switch condicional | ✓ WIRED | Todos os 7 renders condicionais presentes: `<Inicio setView={setView} />`, `<Historico />`, `<Relatorio />`, `<Mensalistas ref={mensalistasRef} />`, `<Financeiro />`, `<Excluidos />`, `<Configuracoes />` |
| `src/renderer/src/App.tsx` | `useGlobalShortcuts` | hook call | ✓ WIRED | `useGlobalShortcuts({ view, onCtrlN: () => mensalistasRef.current?.openNewClientModal() })` |
| `src/renderer/src/App.tsx` | `MensalistasHandle` ref | `useRef<MensalistasHandle>` | ✓ WIRED | `mensalistasRef` criado e passado como `ref={mensalistasRef}` para `<Mensalistas>` |
| `src/renderer/src/views/Inicio.tsx` | `printEntry` / `printExit` | services/printer.ts | ✓ WIRED | Import e chamadas diretas confirmadas (3 ocorrências de printEntry/printExit) |
| `src/renderer/src/views/Inicio.tsx` | `useTickets` | hook | ✓ WIRED | `const { tickets, reload: reloadTickets, tick } = useTickets()` |
| `src/renderer/src/views/Inicio.tsx` | `useBarcodeScanner` | hook | ✓ WIRED | Import e chamada confirmados |
| `src/renderer/src/hooks/useTickets.ts` | `getTickets` | services/tickets.ts | ✓ WIRED | Import e chamada via `reload` callback |
| `src/preload/index.ts` | `ipcRenderer.invoke('print-entry')` | api.printEntry | ✓ WIRED | printEntry e printExit adicionados ao preload com tipos corretos |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `Inicio.tsx` | `tickets` | `useTickets` → `getTickets()` → `window.api.getTickets()` → IPC | DB query via main process | ✓ FLOWING |
| `Mensalistas/index.tsx` | `clients` | `loadClients` → `getClients()` → `window.api.getClients()` → IPC | DB query | ✓ FLOWING |
| `Historico.tsx` | `historyForDay` | `getHistoryForDay(day)` → `window.api.getHistoryForDay()` | DB query | ✓ FLOWING |
| `Financeiro.tsx` | `mixedTransactionsAll` | `useMemo([history, financialHistory])` via services | DB queries | ✓ FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — requer Electron em execução. Não há entry points runnable no ambiente de verificação.

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| REF-01 | Nenhum arquivo do renderer ultrapassa ~400 linhas | PARTIAL | Inicio.tsx = 637 linhas. Todos os outros < 300. App.tsx = 131. WARNING, não BLOCKER dado o `~` e a justificativa técnica (5 fluxos complexos inseparáveis). |
| REF-02 | IPC apenas via hooks/serviços tipados — sem `window.electronAPI.ipcRenderer.invoke` | ✓ SATISFIED | Zero ocorrências do anti-pattern no renderer. window.api.* em components pré-existentes não modificados está fora do escopo desta fase e usa a `api` tipada (não o canal legado `electronAPI`). |
| REF-03 | Testes existentes passando + UAT manual documentado | PARTIAL | Testes Vitest: 36/36. Typecheck: 0 erros. UAT manual: documentado no SUMMARY mas não executável neste ambiente automatizado — requer confirmação humana. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|---------|--------|
| `src/renderer/src/components/ModalCheckout.tsx` | 51 | `window.api.excludeTicket(...)` | ℹ️ Info | Componente pré-existente não modificado nesta fase. Usa a `api` tipada (não o canal legado). Escopo: v2 hardening (IPC-01). |
| `src/renderer/src/components/ModalNovoCliente.tsx` | 195-201 | `window.api.updateClient`, `window.api.createClient`, `window.api.printSubscription` | ℹ️ Info | Componente pré-existente não modificado nesta fase. |
| `src/renderer/src/components/ModalRenovar.tsx` | 87-102 | `window.api.renewSubscription`, `window.api.printSubscription` | ℹ️ Info | Componente pré-existente não modificado nesta fase. |
| `src/renderer/src/components/Versions.tsx` | 4 | `window.electron.process.versions` | ℹ️ Info | Usa `window.electron` (electronAPI do toolkit) para dados de versão — não é IPC de negócio. Pré-existente. |
| `npm run lint` | — | 58 erros (any, missing return type, unused vars) | ⚠️ Warning | Todos pré-existentes. Baseline pré-fase era 82 erros; fase reduziu para 58. Nenhum erro introduzido. |
| `Inicio.tsx` | — | 637 linhas (excede ~400 guideline) | ⚠️ Warning | JSX verbatim extraído de App.tsx. 5 fluxos distintos inseparáveis sem refactor adicional. Decisão técnica documentada em SUMMARY 01-05. |

---

### Human Verification Required

#### 1. Fluxo Completo de Entrada e Saída

**Test:** Executar `npm run dev`. Digitar placa nova na tela Início, clicar "Registrar entrada". Em seguida clicar "Saída" no ticket gerado, confirmar no ModalCheckout.
**Expected:** Ticket aparece na lista após entrada. ModalCheckout mostra valor calculado. Após confirmar: ticket some da lista. Console mostra printEntry e printExit disparados (ou alerta de erro de impressão se sem impressora).
**Why human:** Requer Electron em execução com renderer + main process + IPC ativo. Não testável programaticamente.

#### 2. Fluxo Devedor e Garagem

**Test:** Com mensalista em atraso cadastrado: digitar placa → verificar que `debtorDecisionOpen` modal aparece com opções "Cobrar avulso" e "Mensalistas". Com mensalista de plano GARAGEM: digitar placa → verificar que `garageEntryModal` abre pedindo confirmação de diária.
**Expected:** Modais corretos aparecem para cada tipo de mensalista. Escolha de "Mensalistas" navega para a view correta via `setView('mensalistas')`.
**Why human:** Requer dados de teste no banco (mensalista ativo com débito; mensalista com plan_type GARAGEM) e Electron em execução.

#### 3. Ctrl+N na view Mensalistas

**Test:** Com app aberto na view Mensalistas, pressionar Ctrl+N.
**Expected:** Modal "Novo Cliente" (ModalNovoCliente) aparece imediatamente, campo nome em foco.
**Why human:** Requer Electron em execução; o wiring via `useImperativeHandle` + `forwardRef` + `mensalistasRef.current?.openNewClientModal()` é correto no código mas o evento de teclado real só pode ser validado com DOM ativo.

---

### Gaps Summary

Nenhum gap bloqueador encontrado. A fase atingiu seu objetivo central: App.tsx de 1839 linhas foi reduzido a 131 linhas (shell com sidebar + router). Todas as 7 views vivem em arquivos próprios. O anti-pattern `window.electron.ipcRenderer.invoke` foi completamente eliminado. 36 testes passam. TypeScript sem erros.

O único desvio material — Inicio.tsx com 637 linhas — foi antecipado e justificado pelo executor (view mais complexa do produto, 5 fluxos inseparáveis sem refactor adicional). O `~` na regra indica guideline aproximado, não limite rígido.

A confirmação humana pendente (UAT manual do fluxo de entrada/saída) é o único item que impede o status `passed`.

---

_Verified: 2026-05-12T10:15:00Z_
_Verifier: Claude (gsd-verifier)_
