# Phase 1: Refatoração do Renderer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 1-Refatoração do Renderer
**Areas discussed:** (todas as 4 áreas foram delegadas para o Claude — usuário disse "não precisa discutir, pode seguir com o plano")

---

## Granularidade da divisão

| Option | Description | Selected |
|--------|-------------|----------|
| Arquivo por view (`views/Xxx.tsx`) | Cada `view === 'xxx'` vira um arquivo chato em `src/renderer/src/views/`. Mínimo deslocamento, fácil de navegar. | ✓ |
| Pasta por view com subcomponentes | `views/Mensalistas/index.tsx + ClientList.tsx + ClientCard.tsx + ...` — abre espaço para fragmentar quando crescer. | |
| Outra abordagem | (free-text) | |

**User's choice:** Delegou ao Claude — escolhido **Arquivo por view** com regra de fallback (se algum arquivo passar 350 linhas durante a execução, promover para subpasta).
**Notes:** Análise das 7 views mostra entre 37 e 228 linhas de JSX cada — todas cabem folgadas em arquivos isolados. Subpasta-por-view agora seria over-engineering; é fácil promover depois se necessário.

---

## Camada de IPC tipada

| Option | Description | Selected |
|--------|-------------|----------|
| Só hooks (`useTickets`, `useClients`, ...) | Cada recurso vira um hook que faz fetch + estado. Componentes consomem hooks. | |
| Só serviços puros (`services/tickets.ts`, ...) | Funções tipadas que envolvem `window.api`. Componentes chamam serviços direto. | |
| Os dois em camadas (service → IPC; hook → estado React) | Service é a única porta para `window.api`; hook só onde tem ciclo de vida (boot fetch + refresh + setInterval). | ✓ |
| Outra abordagem | (free-text) | |

**User's choice:** Delegou ao Claude — escolhido **Os dois em camadas, mas pragmático**.
**Notes:** Services são a única porta para `window.api` (testáveis, tipados num lugar só). Hooks só onde realmente vale (`useTickets` precisa do setInterval de re-render de tempo decorrido; `useClients` precisa de refresh; outras chamadas pontuais não precisam de hook custom). Tarefa pré-requisito (não opcional): adicionar `printEntry` e `printExit` ao `api` do preload + `index.d.ts` para eliminar `window.electron.ipcRenderer.invoke('print-entry'/'print-exit', ...)` em `App.tsx:346/440` (anti-pattern Medium do CONCERNS).

---

## Estado compartilhado (Alert/Confirm/teclado)

| Option | Description | Selected |
|--------|-------------|----------|
| Manter no App + drilling de callbacks | `showAlert` e `confirm` ficam na raiz do App e descem por prop para todas as views. Zero infra nova. | |
| `<DialogProvider>` em Context + `useDialog()` | Lift do estado de alert/confirm para um provider; views chamam `useDialog().alert(...)`. Zero prop drilling. | ✓ |
| Outra abordagem | (free-text) | |

**User's choice:** Delegou ao Claude — escolhido **`<DialogProvider>` em Context + `useDialog()`**.
**Notes:** `showAlert(...)` é chamado de pelo menos 15 lugares hoje (todas as views, todos os modais). Drilling seria pesado e sujo. Context é o caso de uso clássico, é nativo do React (zero dep nova), e centraliza um único `<AlertModal>` montado no provider. O atalho global de teclado (Escape, Ctrl+N) também sobe para um hook `useGlobalShortcuts` usado uma vez no App.

---

## Roteamento entre views

| Option | Description | Selected |
|--------|-------------|----------|
| Manter `View` union + render condicional | Zero dep, mínima mudança. Encapsular o switch num pequeno `<ViewRouter view={view}>`. | ✓ |
| Trazer `react-router-dom` | Rotas reais, code splitting, `useParams`. +30-40 KB no bundle, infra nova. | |
| Outra abordagem | (free-text) | |

**User's choice:** Delegou ao Claude — escolhido **Manter `View` union**.
**Notes:** Produto roda offline numa máquina, é distribuído por pendrive, sem URL, sem voltar/avançar de navegador, sem deep link. `react-router-dom` resolveria zero problemas reais e adicionaria peso ao bundle. As 7 views são 7 botões fixos numa sidebar — switch é o padrão certo. Refinamento opcional: extrair o switch para um pequeno componente `<ViewRouter view={view}>`.

---

## Claude's Discretion

Todas as quatro áreas (granularidade, IPC, estado compartilhado, roteamento) foram delegadas pelo usuário com a fala: *"não é preciso discutir, pode seguir com o plano, mas dentro dele, me explique cada uma dessas fases de forma simplificada"*.

As decisões D-01..D-04 do CONTEXT.md são minhas recomendações justificadas. O usuário pode revisar o CONTEXT.md e contestar qualquer escolha antes do `/gsd-plan-phase`.

Decisões adicionais (D-05..D-09 no CONTEXT.md) — não eram gray areas, mas registrei junto:
- **D-05** Tipos de domínio compartilhados em `src/renderer/src/types/domain.ts`.
- **D-06** Estilo fixo por CONVENTIONS.md (sem `;`, single quote, default export para componente, etc.).
- **D-07** Ordem sugerida de migração (services → fix print* → provider → views menores → Mensalistas → hooks à medida que surgem).
- **D-08** Limite de ~400 linhas é guideline, não lint rule.
- **D-09** Limpezas oportunistas (setInterval clone hack, `useMemo` em `mixedTransactionsAll`).

## Deferred Ideas

Ideias que surgiram lendo o código mas não pertencem a esta fase:

- Race condition em `create-ticket` (CONCERNS High) — main process, backlog.
- Hardcoded LIMIT 50/200/500 nos selects de relatórios (CONCERNS Low) — main process, backlog.
- `printer.ts` 5-path logo probe + timeout race (CONCERNS Medium) — main process, backlog.
- Validação runtime de payloads IPC (zod) — IPC-02 da v2.
- Remover `electronAPI` do preload — IPC-01 da v2 (agora só paramos de usar no renderer).
- Testes de componente React (`@testing-library/react`) — TEST-01/TEST-02 da v2.
- `config.ts` swallows errors (CONCERNS Medium) — main process, backlog.
