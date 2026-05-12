---
phase: 1
plan: "01-04"
title: "Extrair Mensalistas (CRUD + 4 modais + statement)"
status: complete
completed_date: "2026-05-12"
duration_minutes: 40
tasks_completed: 1
tasks_total: 1
files_created:
  - src/renderer/src/views/Mensalistas/index.tsx
  - src/renderer/src/views/Mensalistas/MensalistasTabela.tsx
  - src/renderer/src/views/Mensalistas/DeleteClientModal.tsx
  - src/renderer/src/views/Mensalistas/StatementModal.tsx
files_modified:
  - src/renderer/src/App.tsx
key_decisions:
  - "Fallback D-01 aplicado: JSX total da view ultrapassava 350 linhas (565), aplicada subpasta views/Mensalistas/ com index.tsx (285 linhas) + MensalistasTabela.tsx (258 linhas) + DeleteClientModal.tsx (64 linhas) + StatementModal.tsx (75 linhas)"
  - "forwardRef + useImperativeHandle para Ctrl+N: App.tsx usa mensalistasRef.current?.openNewClientModal() — não há prop drilling; Mensalistas gerencia seu próprio modal state"
  - "ModalRenovar permanece aceitando props individuais (clientId, clientName, planType, ...) — não foi migrado para receber ClientRow diretamente; comportamento verbatim do original"
  - "showConfirm removido de App.tsx destructure — não é mais usado em App (movido para Mensalistas/index.tsx)"
  - "deleteClientModal em App.tsx original era ClientRow | null (não { open, client }) — interface adaptada verbatim"
subsystem: renderer-views
tags: [views, refactor, wave-4, extract-component, forwardRef, useImperativeHandle, subcomponents]
requires:
  - "01-03"
provides:
  - "Mensalistas/index.tsx"
  - "Mensalistas/MensalistasTabela.tsx"
  - "Mensalistas/DeleteClientModal.tsx"
  - "Mensalistas/StatementModal.tsx"
affects:
  - "src/renderer/src/App.tsx"
tech_stack_added:
  patterns:
    - "forwardRef + useImperativeHandle para comunicação imperative parent→child (Ctrl+N)"
    - "Subpasta views/Mensalistas/ com sub-componentes (fallback D-01)"
    - "Prop drilling das operações de tabela via callbacks tipados (onStatement, onEditar, onRenovar, etc.)"
---

# Phase 1 Plan 04: Extrair Mensalistas — Summary

**One-liner:** View de Mensalistas extraída de App.tsx com forwardRef para Ctrl+N, 12 states, 5 handlers, e 4 modais — fallback D-01 aplicado: subpasta `views/Mensalistas/` com 4 arquivos (index.tsx 285 linhas), App.tsx reduz de 1273 para 800 linhas (-473 nesta wave, -1039 total da fase).

## Arquivos Criados

| Arquivo | Role | Linhas |
|---------|------|--------|
| `src/renderer/src/views/Mensalistas/index.tsx` | View principal com forwardRef, estado, handlers e composição de sub-componentes | 285 |
| `src/renderer/src/views/Mensalistas/MensalistasTabela.tsx` | Tabela completa de clientes com 10 colunas e 6 botões de ação | 258 |
| `src/renderer/src/views/Mensalistas/DeleteClientModal.tsx` | Modal de exclusão de mensalista com input de senha | 64 |
| `src/renderer/src/views/Mensalistas/StatementModal.tsx` | Modal de extrato com pagamentos e avulsos em atraso | 75 |

## Modificações

| Arquivo | Mudança | Linhas antes → depois |
|---------|---------|----------------------|
| `src/renderer/src/App.tsx` | Remover 12 states + 4 handlers + JSX inline de Mensalistas; adicionar `mensalistasRef`; atualizar useEffect Ctrl+N | 1273 → 800 (-473) |

## States Movidos de App.tsx

| State | Destino |
|-------|---------|
| `clients`, `searchMensalistas` | Mensalistas/index.tsx |
| `modalNovoClienteOpen`, `clientToEdit` | Mensalistas/index.tsx |
| `modalRenovarOpen`, `renovarClient` | Mensalistas/index.tsx |
| `statementOpen`, `statementData` | Mensalistas/index.tsx |
| `deleteClientModal`, `deleteClientPassword`, `deleteClientError`, `deleteClientLoading` | Mensalistas/index.tsx |

## Handlers Movidos de App.tsx

| Handler | Destino |
|---------|---------|
| `loadClients` | Mensalistas/index.tsx (como useCallback([showAlert])) |
| `openEditarCliente` | Mensalistas/index.tsx |
| `openCancelConfirm` | Mensalistas/index.tsx |
| `openReativarConfirm` | Mensalistas/index.tsx |
| `openRenovar` | Mensalistas/index.tsx |
| `openStatement` | Mensalistas/index.tsx |
| `openDeleteModal` / `handleDeleteConfirm` | Mensalistas/index.tsx |

## Commits

| Task | Hash | Descrição |
|------|------|-----------|
| Task 1 | e880835 | refactor(renderer): extrair view Mensalistas de App.tsx com forwardRef + sub-componentes (01-04 task 1) |

## Gates Verificados

| Gate | Resultado |
|------|-----------|
| `npm run typecheck` (main repo) | PASSOU |
| `npm test` (36 tests) | PASSOU |
| `window.` em todos arquivos Mensalistas/ | 0 — PASSOU |
| `index.tsx` linhas | 285 (< 350) — PASSOU |
| `<Mensalistas ref={mensalistasRef} />` em App.tsx | 1 — PASSOU |
| `<ModalNovoCliente` em App.tsx | 0 — PASSOU |
| `<ModalRenovar` em App.tsx | 0 — PASSOU |
| `useState.*modalNovoClienteOpen` em App.tsx | 0 — PASSOU |
| App.tsx linhas | 800 (< 1300) — PASSOU |
| forwardRef em index.tsx | 2 — PASSOU |
| useImperativeHandle em index.tsx | 2 — PASSOU |
| MensalistasHandle em index.tsx | 2 — PASSOU |
| showConfirm em index.tsx | 3 (cancelar + reativar + mais uma) — PASSOU (>= 2) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Fallback D-01] View excedeu limite de 350 linhas — subpasta aplicada**
- **Found during:** Task 1
- **Issue:** O JSX completo de Mensalistas resulta em 565 linhas (estimativa do plano era ~250). A tabela de clientes com 10 colunas e botões SVG é muito verbosa.
- **Fix:** Aplicado fallback D-01 do plano: criar subpasta `views/Mensalistas/` com sub-componentes. index.tsx ficou em 285 linhas (< 350). MensalistasTabela.tsx extrai a tabela; DeleteClientModal.tsx e StatementModal.tsx extraem os modais inline.
- **Files modified:** Estrutura `views/Mensalistas/` criada em vez de `views/Mensalistas.tsx` flat
- **Commit:** e880835

**2. [Rule 1 - Cleanup] `showConfirm` removido do destructure de useDialog() em App.tsx**
- **Found during:** Task 1
- **Issue:** Após mover openCancelConfirm e openReativarConfirm para Mensalistas, App.tsx ainda destrutturava `showConfirm` de useDialog() sem usá-lo
- **Fix:** Removido do destructure
- **Files modified:** `src/renderer/src/App.tsx`
- **Commit:** e880835

**3. [Rule 1 - Interface] `ModalRenovar` aceita props individuais, não ClientRow**
- **Found during:** Task 1
- **Issue:** O plan indicava `client: ClientRow | null` como prop, mas o ModalRenovar.tsx existente aceita props individuais (`clientId`, `clientName`, `planType`, etc.). O App.tsx original também passava um objeto intermediário.
- **Fix:** Mensalistas/index.tsx mantém o mesmo padrão do App.tsx original: estado `renovarClient` com o shape de props individuais, passado diretamente ao ModalRenovar.
- **Files modified:** `src/renderer/src/views/Mensalistas/index.tsx`
- **Commit:** e880835

## Contagem de Linhas (Real)

| Arquivo | Linhas |
|---------|--------|
| `views/Mensalistas/index.tsx` | 285 |
| `views/Mensalistas/MensalistasTabela.tsx` | 258 |
| `views/Mensalistas/DeleteClientModal.tsx` | 64 |
| `views/Mensalistas/StatementModal.tsx` | 75 |
| `App.tsx` (após wave 4) | 800 |

Fallback D-01 necessário: view excedeu 350 linhas (total JSX ~ 565 linhas). Subpasta aplicada conforme instrução do plano.

## UAT Manual

Nota: UAT manual requer `npm run dev` na máquina do operador. Os 14 itens do checklist abaixo devem ser verificados manualmente:

1. Navegar para Mensalistas → confirmar que lista carrega
2. Digitar parte de um nome no campo de busca → confirmar filtro
3. Digitar parte de uma placa no campo de busca → confirmar filtro (T-04-02)
4. Digitar dígitos de CPF → confirmar filtro por CPF funciona
5. Pressionar Ctrl+N na view Mensalistas → modal Novo Cliente abre (T-04-05)
6. Cadastrar um cliente novo via modal → confirmar lista atualiza
7. Editar um cliente existente → confirmar lista atualiza
8. Cancelar plano de um cliente → confirmar showConfirm aparece, clicar Confirmar, status muda para inativo
9. Reativar o mesmo cliente → confirmar showConfirm aparece, clicar Confirmar, status muda para ativo
10. Renovar plano → modal abre, salvar → confirmar lista atualiza
11. Ver extrato → modal de statement abre, listas de pagamentos e avulsos aparecem corretamente
12. Excluir mensalista com senha errada → erro aparece no modal
13. Excluir mensalista com senha correta → cliente sai da lista, alert de sucesso
14. Verificar que outras views (Histórico, Relatório, Excluídos, Configurações) ainda funcionam

## Known Stubs

Nenhum — view consome services reais sem dados mockados.

## Threat Flags

Nenhum — mudanças são puramente de refatoração interna do renderer. Nenhum novo endpoint, auth path ou schema change introduzido.

## Próximo Plano

**01-05** — Inicio + hooks + cleanup final (a wave mais arriscada: extrai o maior bloco de JSX restante e consolida toda a refatoração).

## Self-Check: PASSED

- src/renderer/src/views/Mensalistas/index.tsx: FOUND (285 linhas)
- src/renderer/src/views/Mensalistas/MensalistasTabela.tsx: FOUND (258 linhas)
- src/renderer/src/views/Mensalistas/DeleteClientModal.tsx: FOUND (64 linhas)
- src/renderer/src/views/Mensalistas/StatementModal.tsx: FOUND (75 linhas)
- App.tsx: 800 linhas (< 1300)
- window. em Mensalistas/: 0
- <Mensalistas ref={mensalistasRef} /> em App.tsx: 1 (linha 627)
- import Mensalistas em App.tsx: 1
- useRef<MensalistasHandle> em App.tsx: 1
- modalNovoClienteOpen em App.tsx: 0
- deleteClientModal em App.tsx: 0
- statementOpen em App.tsx: 0
- <ModalNovoCliente em App.tsx: 0
- <ModalRenovar em App.tsx: 0
- Commit e880835: FOUND
