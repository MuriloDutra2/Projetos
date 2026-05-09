# Phase 1: Refatoração do Renderer - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Quebrar `src/renderer/src/App.tsx` (1839 linhas) em módulos coesos onde **nenhum arquivo do renderer passa de ~400 linhas**, com IPC encapsulado em **hooks/serviços tipados** (zero `window.electron.ipcRenderer.invoke(...)` direto nos componentes), **sem regredir** os fluxos de produção (entrada → saída → cobrança para placa avulsa, mensalista, garagem, funcionário, devedor).

Refactor *enabling*, não feature: nada que o operador vê hoje muda. O ganho é tornar o código pronto para receber as próximas fases (família, admin de senhas, backup) sem multiplicar risco de regressão.

**O que ESTÁ no escopo desta fase:**
- Extrair as 7 views (`inicio`, `historico`, `relatorio`, `mensalistas`, `financeiro`, `excluidos`, `configuracoes`) cada uma para o seu próprio arquivo.
- Encapsular toda chamada IPC em uma camada tipada — componentes nunca tocam `window.api` diretamente.
- Eliminar o anti-pattern de `window.electron.ipcRenderer.invoke('print-entry'/'print-exit', ...)` em `App.tsx:346/440`, expondo `printEntry` e `printExit` no `api` do preload.
- Lift de estado realmente cross-view (alert, confirm) para um provider; estado por view desce para a view.
- Manter os Vitest existentes (`calculations.test.ts`, `garageDates.test.ts`) verdes; manter `npm run typecheck` e `npm run lint` verdes.
- Validar via UAT manual descrito em `TESTES-ANTES-DO-PENDRIVE.md`.

**O que NÃO está no escopo (já decidido em outras fases / na v2):**
- Remover `electronAPI` do preload (IPC-01) → v2.
- Validação runtime de payloads IPC (zod, IPC-02) → v2.
- Testes de componente React novos (TEST-01, TEST-02) → v2.
- Senhas hardcoded → Phase 4.
- Backup automático do banco → Phase 3.
- Família por CPF → Phase 5.
- Bugs de race condition em `create-ticket` e foreign keys disabled em delete client (CONCERNS.md) → tratados em fases que tocam main process.

</domain>

<decisions>
## Implementation Decisions

> O usuário delegou as quatro áreas de gray area para mim ("Claude's Discretion"). As decisões abaixo são minhas recomendações; cada uma é justificada em "por que" para que ele possa contestar antes/durante o `/gsd-plan-phase`.

### D-01 — Granularidade da divisão das views

**Decisão:** Um arquivo por view, em `src/renderer/src/views/`. Sem subpasta-por-view por enquanto.

```
src/renderer/src/views/
├── Inicio.tsx          (entrada de placa, lista de tickets ativos, decisão de devedor, garagem)
├── Historico.tsx       (lista de finalizados; filtros 24h e por dia)
├── Relatorio.tsx       (relatório diário; export PDF)
├── Mensalistas.tsx     (CRUD de clientes, busca, statement, renovação)
├── Financeiro.tsx      (transações mistas + resumo por método de pagamento)
├── Excluidos.tsx       (lista de tickets EXCLUIDO)
└── Configuracoes.tsx   (seleção de impressora)
```

**Por que (simplificado):** As 7 views, lendo `App.tsx`, dividem-se em ~228, 101, 115, 203, 107, 37, 50 linhas de JSX cada — tudo cabe folgado em arquivos isolados sem precisar de subpastas. Subpasta-por-view (`views/Mensalistas/index.tsx + ClientList.tsx + ...`) seria over-engineering agora; o jeito certo é só fragmentar quando o arquivo realmente passa de ~300 linhas. **Regra de fallback:** se durante a execução algum arquivo de view ultrapassar 350 linhas, aí sim a gente promove a subpasta com componentes filhos. Mensalistas é o candidato mais provável.

### D-02 — Camada de IPC tipada (cumprindo REF-02)

**Decisão:** Camada dupla, mas pragmática.

1. **`src/renderer/src/services/`** — wrappers finos, tipados, agrupados por domínio. Cada service é um arquivo de funções puras (não retorna estado React). Os services são a **única** porta de entrada para `window.api` — todos os componentes e hooks importam dos services, nunca de `window.api`.
   ```
   src/renderer/src/services/
   ├── tickets.ts      (createTicket, checkoutTicket, calculateValue, getTickets, ...)
   ├── clients.ts      (getClients, createClient, updateClient, toggleClientStatus, deleteClient, getClientStatement, renewSubscription)
   ├── plates.ts       (checkPlateSubscription, checkPlateWasInToday)
   ├── financial.ts    (getFinancialHistory, getFinancialSummaryByMethod, exportFinancialCsv)
   ├── reports.ts      (getDailyReport, saveDailyReport, exportDailyReportPdf, getHistory, getHistoryForDay, getHistoryLast24h, getExcludedTickets, excludeTicket, excludeAllActiveTickets)
   ├── printer.ts      (printEntry, printExit, printSubscription, getPrinters, getPrinterConfig, savePrinterConfig)
   └── types.ts        (re-exporta tipos compartilhados de domínio)
   ```

2. **`src/renderer/src/hooks/`** — hooks só onde tem ciclo de fetch + estado + refresh React. Não criar hook por endpoint, só onde vale.
   ```
   src/renderer/src/hooks/
   ├── useBarcodeScanner.ts   (já existe, mantido)
   ├── useTickets.ts          (boot fetch + setInterval re-render + refresh; consome services/tickets.ts)
   ├── useClients.ts          (fetch + refresh; consome services/clients.ts)
   ├── useFinancial.ts        (fetch + refresh do mês selecionado)
   ├── useDailyReport.ts      (fetch para a data selecionada)
   └── useGlobalShortcuts.ts  (Escape, Ctrl+N — escuta única no document)
   ```

**Tarefa pré-requisito (não opcional):** adicionar `printEntry` e `printExit` em `src/preload/index.ts` + `src/preload/index.d.ts`, e eliminar os dois `window.electron.ipcRenderer.invoke('print-entry'/'print-exit', ...)` em `App.tsx:346` e `:440`. Isso fecha REF-02 e o anti-pattern Medium do CONCERNS.md.

**Por que (simplificado):** Hoje o `App.tsx` chama `window.api.foo(...)` em ~20 lugares. Um service é só uma função `export async function getTickets(): Promise<Ticket[]> { return window.api.getTickets() }` — torna a chamada testável (no futuro, mockar `services/tickets.ts` é trivial), tipa o retorno num lugar só, e satisfaz a regra "componentes não chamam IPC direto". Os hooks são opcionais — se uma view só faz uma chamada e mostra o resultado, o componente chama o service no `useEffect` direto, sem hook custom. Hooks só onde tem complexidade de ciclo de vida (`useTickets` precisa do `setInterval` de re-render de tempo decorrido).

### D-03 — Estado compartilhado: `<DialogProvider>` em Context

**Decisão:** Lift de `alertState` e `confirmState` para um Context provider; criar hook `useDialog()` que retorna `{ alert, confirm }`. O atalho global de teclado (Escape, Ctrl+N) sobe para um `useGlobalShortcuts` hook usado uma única vez no App.

```
src/renderer/src/providers/DialogProvider.tsx
  -> exporta <DialogProvider> e useDialog()
  -> renderiza <AlertModal> e o modal de confirmação
  -> guarda { alertState, confirmState } internamente
```

**Por que (simplificado):** `showAlert(...)` é chamado de pelo menos 15 lugares hoje (todas as views, todos os modais). Passar como prop por todo lado seria drilling pesado e sujo. Context aqui é o caso de uso clássico — não adiciona dependência (Context é nativo do React), e centraliza um único `<AlertModal>` montado no provider em vez de re-render por view.

**Estado que continua na raiz do App (não vira Context):**
- `view` / `setView` (navegação) — passa por prop aos botões da sidebar e ao switch de render.
- Estado próprio de cada view (placa digitada, tickets carregados, financeFilterMonth, dailyReport, etc.) — desce para dentro da view dona dele.

**Estado que sobe para o Provider (Context):**
- alert (mostrar/esconder, título, mensagem, tipo).
- confirm (mostrar/esconder, título, mensagem, callback).

### D-04 — Roteamento entre views: manter o atual

**Decisão:** Manter `type View = 'inicio' | 'historico' | ...` + render condicional. **Não** trazer `react-router-dom`.

**Por que (simplificado):** O produto roda offline em uma máquina, é distribuído por pendrive, não tem URL, não precisa de "voltar/avançar" do navegador, nem de deep link. Adicionar `react-router-dom` seria 30-40 KB extra no bundle e infraestrutura que não resolve nenhum problema atual. As 7 views são 7 botões fixos numa sidebar e cada um troca um `useState<View>` — esse padrão é simples, lê bem, e não precisa de melhoria.

**Refinamento opcional dentro da fase:** mover o `useState<View>` + lógica do switch para um pequeno componente `<ViewRouter view={view}>` que faz `switch (view) { case 'inicio': return <Inicio />; ... }`. Isso só esconde o `if/else` repetido e fica embaixo de 30 linhas.

### Claude's Discretion

Áreas em que o usuário disse "não precisa discutir, pode seguir com o plano":

- **D-01** Granularidade da divisão (escolhi: arquivo por view, sem subpasta).
- **D-02** Camada de IPC (escolhi: services + hooks só onde vale).
- **D-03** Estado compartilhado (escolhi: Context para Alert/Confirm; hook para teclado; estado por view fica na view).
- **D-04** Roteamento (escolhi: manter `View` union, sem react-router).

Se ele revisar este CONTEXT.md e quiser mudar alguma escolha, basta dizer no `/gsd-plan-phase` antes de executar.

### Outras decisões que não eram gray areas mas valem registrar

- **D-05** Tipos de domínio compartilhados (`Ticket`, `HistoryEntry`, `ClientRow`, `SubscriptionInfo`, `ClientStatement`) hoje vivem inline em `App.tsx`. Movem para `src/renderer/src/types/domain.ts` (named exports), reusados pelos services e pelas views.
- **D-06** Estilo já fixo por CONVENTIONS.md: sem `;`, single quote, `export default` para componente, named export para helpers, Tailwind + `clsx`, sem barrel `index.ts`. Toda criação de arquivo segue isso.
- **D-07** Ordem de migração (sugestão para o planner): (1) extrair services + tipos compartilhados, (2) consertar `printEntry`/`printExit` no preload + adaptar chamadas, (3) criar `<DialogProvider>`, (4) extrair as 7 views uma por vez começando pelas menores (Excluidos → Configuracoes → Historico → Relatorio → Financeiro → Inicio → Mensalistas), commit atômico por view, (5) criar hooks (`useTickets`, etc.) à medida que o estado de cada view é puxado para dentro dela. Cada commit roda `npm run typecheck && npm run lint && npm run test:unit` antes de seguir.
- **D-08** Limite de ~400 linhas: **guideline**, não lint rule. Validado por inspeção visual ao final da fase. Configurar `max-lines` no ESLint adiciona ruído (afeta tests, modais legítimos) sem ganho proporcional.
- **D-09** Aproveitar a passagem para limpar dois micro-débitos baratos quando o código for tocado:
  - O `setInterval(setTickets((p) => [...p]), 60000)` em `App.tsx:212` (CONCERNS Low — clone do array só para forçar re-render) vira `useState<number>` de tick dentro de `useTickets`.
  - O `mixedTransactionsAll` (App.tsx:404) ganha `useMemo` ao mudar de casa para `views/Financeiro.tsx`.
  Esses dois são oportunistas — se complicar a fase, ficam para depois.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Escopo e requisitos
- `.planning/PROJECT.md` — contexto do produto (offline, pendrive, pt-BR, operadores não-técnicos, brownfield em produção). Constraints invariantes.
- `.planning/REQUIREMENTS.md` §"Refatoração do Renderer (REF)" — REF-01 (≤400 linhas, áreas funcionais), REF-02 (hooks/serviços tipados), REF-03 (testes verdes + UAT manual). Áreas funcionais futuras listadas (família, admin/senhas, backup).
- `.planning/ROADMAP.md` Phase 1 — Goal, Success Criteria, Mode mvp.

### Mapa do código existente
- `.planning/codebase/ARCHITECTURE.md` — IPC inventory (~25 channels), `dbOperations`, `api` no preload, `View` union, anti-pattern "Monolithic 1839-line App.tsx" e "Renderer reaches around `window.api`" com a correção esperada.
- `.planning/codebase/STRUCTURE.md` §"Where to Add New Code" — convenção de onde colocar nova view, novo modal, novo hook, novo helper.
- `.planning/codebase/CONVENTIONS.md` — Prettier (sem `;`, single quote, 100 cols), ESLint react-hooks, default export para componente, named para helpers, Tailwind + `clsx`, sem barrel.
- `.planning/codebase/CONCERNS.md` §"Fragile Areas" — descrição completa do god-component, lista dos 35+ `useState`, dependência do effect de teclado em 8 estados; §"Tech Debt" — anti-pattern do `window.electron.ipcRenderer.invoke('print-entry'/'print-exit')`.
- `.planning/codebase/TESTING.md` — coverage atual (apenas `calculations.test.ts` e `garageDates.test.ts` no main process; renderer sem testes). REF-03 só exige manter os atuais verdes.

### Arquivos a refatorar / tocar
- `src/renderer/src/App.tsx` — alvo principal do refactor (1839 linhas).
- `src/preload/index.ts` — adicionar `printEntry`, `printExit` ao `api`.
- `src/preload/index.d.ts` — declarar os dois novos métodos no `Window['api']`.
- `src/renderer/src/components/{AlertModal,ModalCheckout,ModalNovoCliente,ModalRenovar}.tsx` — modais ficam onde estão; usados pelas views novas e pelo `<DialogProvider>` (no caso de `AlertModal`).
- `src/renderer/src/hooks/useBarcodeScanner.ts` — hook existente, mantido sem mudanças.
- `src/renderer/src/utils/{masks,errorHandler}.ts` — mantidos; reutilizados por todas as views novas.

### Validação
- `TESTES-ANTES-DO-PENDRIVE.md` — checklist de UAT manual exigido por REF-03 antes do build sair.
- `__tests__/unit/calculations.test.ts` e `__tests__/unit/garageDates.test.ts` — devem continuar passando (`npm run test:unit`).
- Comandos de gate: `npm run typecheck`, `npm run lint`, `npm run test:unit`, e o build `npm run build` (sanity check do bundle).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/src/components/AlertModal.tsx` — já tem o padrão "open + title + message + type + onClose". Vai ser montado uma única vez dentro do `<DialogProvider>`.
- `src/renderer/src/components/ModalCheckout.tsx`, `ModalNovoCliente.tsx`, `ModalRenovar.tsx` — modais ficam como estão; cada view importa o modal que usa e mantém o `useState<boolean>` de abertura local.
- `src/renderer/src/hooks/useBarcodeScanner.ts` — hook já existe e segue o padrão "(callback, enabled)" — `views/Inicio.tsx` vai usar como hoje (`useBarcodeScanner(handleBarcodeScanned, view === 'inicio')` vira simplesmente `useBarcodeScanner(handleBarcodeScanned, true)` dentro da view, já que ela só renderiza quando ativa).
- `src/renderer/src/utils/masks.ts` (`maskPlate`, `plateToRaw`, `validatePlate`, `formatPhone`, `formatCpf`) — mantém-se igual; views importam direto.
- `src/renderer/src/utils/errorHandler.ts` (`friendlyError`) — mantido; `<DialogProvider>` o usa internamente para padronizar mensagens.
- `src/preload/index.ts` `api` (camelCase) — base para os services; todos os 30+ métodos ali viram funções tipadas em `services/*`.

### Established Patterns
- **No-`React.import` JSX runtime:** componentes só importam hooks e tipos do `react`, nunca o default. Mantém em todo arquivo novo.
- **Default export para componentes** (`export default function ViewInicio(): React.JSX.Element`) e **named export para helpers** (`export async function getTickets(): Promise<Ticket[]>`).
- **`clsx` para classes condicionais:** padrão dos modais existentes — copiar nas views.
- **`if (!isOpen) return null` no topo dos modais** — convenção dos componentes em `components/`.
- **Sem barrel files:** `src/renderer/src/views/index.ts` agregando exports é tentador, **não fazer** — a CONVENTIONS proíbe e cada `import` aponta para o arquivo direto.
- **Tipos inline acima do componente:** `interface ViewInicioProps { ... }` declarado logo antes do `export default function`. Quando o tipo é compartilhado, vai pra `types/domain.ts`.

### Integration Points
- **Mount do provider:** `src/renderer/src/main.tsx` envolve `<App />` com `<DialogProvider>`. Esse é o único lugar onde a montagem acontece. Alternativa equivalente: provider no topo do `<App />` retornado.
- **`window.api` agora só vive em `services/*`:** os ~50 chamados de `window.api.*` em `App.tsx` somem; viram `import { getTickets, createTicket } from '../services/tickets'`.
- **`window.electron.ipcRenderer.invoke('print-entry'/'print-exit', ...)` desaparece:** depois de adicionar `printEntry`/`printExit` no preload, `services/printer.ts` exporta-os tipados e as views chamam `printEntry({ id, placa, entrada })` e `printExit({ placa, entrada, saida, valor, tempoTotal })`.
- **Estilo do dark theme já fixado** (`bg-slate-800`, `bg-gray-800`, vermelhos para destrutivo, azuis para ações) — qualquer view nova herda essa paleta sem decidir.
- **Dois caminhos de build:** dev (`npm run dev` via `electron-vite`) lê do filesystem; prod (`npm run build && npm run dist:installer`) bundla. O refactor é puramente em `src/renderer/src/` — nenhuma mudança em `electron.vite.config.ts` necessária.

</code_context>

<specifics>
## Specific Ideas

- A pasta `src/renderer/src/views/` ainda **não existe** — o planner cria nesta fase.
- A pasta `src/renderer/src/services/` ainda **não existe** — idem.
- A pasta `src/renderer/src/providers/` ainda **não existe** — idem.
- A pasta `src/renderer/src/types/` ainda **não existe** — idem.
- Ordem sugerida (D-07) é nice-to-have do plano; o planner pode ajustar com base em dependências reais entre views.
- O usuário pediu explicitamente: "explique cada uma dessas fases de forma simplificada". O CONTEXT.md acima já cumpre isso (cada D-XX tem uma seção "Por que (simplificado)"). O planner pode replicar esse tom no PLAN.md ao gerar tasks.

</specifics>

<deferred>
## Deferred Ideas

Ideias que apareceram lendo o código, mas **não pertencem a esta fase** — não esquecer:

- **Race condition em `create-ticket`** (`src/main/index.ts:105-124`, CONCERNS High): check + insert sem transação. Toca main process, fora do escopo do refactor de renderer. Considerar em uma issue própria ou junto com Phase 4/5 quando o main for tocado.
- **Hardcoded LIMIT 50/200/500** em `src/main/db.ts:101,118,194` (CONCERNS Low): silently trunca relatórios financeiros depois de meses de uso. Não é refactor de renderer; rastrear para v2.
- **`printer.ts` 5-path logo probe** + timeout race (CONCERNS Medium): mecânica do main process; backlog.
- **Validação runtime de payloads IPC** (zod): IPC-02 da v2.
- **Remover `electronAPI` do preload**: IPC-01 da v2 — agora só paramos de usá-lo no renderer.
- **Testes de componente React** (`@testing-library/react`): TEST-01/TEST-02 da v2; o refactor cria a superfície ideal para esses testes futuros, mas não os escreve.
- **`config.ts` swallows errors** (CONCERNS Medium): main process; backlog.

Reviewed Todos (not folded): nenhum — `todo.match-phase` retornou `todo_count = 0`.

</deferred>

---

*Phase: 1-Refatoração do Renderer*
*Context gathered: 2026-05-09*
