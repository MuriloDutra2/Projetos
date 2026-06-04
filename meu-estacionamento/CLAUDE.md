# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Estacionamento Software** — Electron + React + SQLite desktop app for parking management. In production at one client (gym parking lot, BR). Distributed via USB drive; the production machine has **no internet**.

See `.planning/PROJECT.md` for full context, `.planning/ROADMAP.md` for current milestone, and `.planning/codebase/` for architecture/conventions/concerns inferred from the existing code.

## Hard constraints

- **No internet on the production machine.** Never introduce code that depends on outbound network calls (telemetry, license validation, auto-updater servers, cloud APIs). Everything must work offline.
- **Updates ship via USB drive.** Builds must be reproducible from this repo and run offline. Do not assume `npm install` happens on the client machine.
- **Production data must not be lost or overwritten.** `parking.db` lives in Electron `userData` and contains real customer records (mensalistas, tickets, payments). Migrations and installers must preserve it; never reset, drop, or overwrite without an explicit, password-protected user action.
- **`parking.db` is sensitive.** It contains real PII (CPF, phone, plates). Never commit it to git, never copy it into logs, and never include it in documentation or AI training-style outputs. Phase 2 of the current roadmap removes it from history; until then, do not stage it.
- **UI and domain identifiers in pt-BR.** Existing code uses Portuguese identifiers (`MENSAL_CARRO`, `garagem`, `mensalistas`, etc.) and pt-BR UI strings. Match the existing language; do not rename to English.
- **Operators are non-technical.** UI changes must be robust to mistakes — confirmations on destructive actions, clear error messages, no developer jargon.

## Workflow (GSD)

This project uses Get-Shit-Done planning. Active milestone roadmap is at `.planning/ROADMAP.md`. The expected loop per phase is:

1. `/gsd-discuss-phase N` — gather context and clarify approach
2. `/gsd-ui-phase N` — generate UI design contract (UI-heavy phases only)
3. `/gsd-plan-phase N` — create the detailed plan
4. `/gsd-execute-phase N` — execute with atomic commits
5. `/gsd-verify-work` — confirm requirements were met

Workflow preferences (`.planning/config.json`): YOLO mode, standard granularity, parallel plan execution, planning docs tracked in git, balanced model profile, research/plan-check/verifier all enabled.

## Stack quick reference

See `.planning/codebase/STACK.md` for the full breakdown. Headlines:

- **Main process:** Electron + TypeScript (`src/main/`), `electron-vite` build, `electron-builder` packaging
- **Preload:** `src/preload/` — currently exposes both a typed `api` and a broad `electronAPI` (the latter is on the v2 hardening backlog)
- **Renderer:** React 18 + Tailwind CSS 3 (`src/renderer/`), entry point `App.tsx` (refatorado — god-component foi dividido)
- **Persistence:** SQLite via better-sqlite3, arquivo em `parking.db` no `userData`
- **Tests:** Vitest (`__tests__/`), config at `vitest.config.ts`
- **Manual UAT:** `TESTES-ANTES-DO-PENDRIVE.md` is the pre-deployment checklist

## Estado atual (junho/2026)

### Já concluído (branch `main`)
- ✅ **REF (Phase 1)** — `App.tsx` refatorado, god-component dividido
- ✅ **BAK (Phase 3)** — Backup automático do `parking.db` a cada startup (rolling 10 cópias em `userData/backups/`)
- ✅ **FAM (Phase 5)** — Bug de tolerância de família corrigido (CPF único global)
- ✅ **Calculadora Pro-Rata** — Nova aba para calcular valor proporcional de novos mensalistas (`src/renderer/src/views/Calculadora.tsx`)
- ✅ **Senhas unificadas** — Senha de excluir mensalista unificada com excluir veículo do pátio (`161021`)

### Pendente (branch `main`)
- ⏳ **SEC (Phase 2)** — `parking.db` ainda no histórico git com PII real — precisa de `git filter-repo`
- ⏳ **AUTH (Phase 4)** — Senhas admin ainda hardcoded em `src/main/index.ts` (linha ~512)

### Em andamento (branch `feature/lan-sync`)
Novo milestone: **Sincronização LAN entre dois PCs** (mesmo estacionamento, rede local).
- ✅ **Fase 1** — Tabela `sync_log` + `node_id` único por instalação (`src/main/db.ts`)
- ✅ **Fase 2** — Servidor HTTP (porta 3457) + WebSocket para broadcast em tempo real (`src/main/syncServer.ts`)
- ⏳ **Fase 3** — Modo cliente: conectar ao servidor via LAN
- ⏳ **Fase 4** — Sync bidirecional automático com resolução de conflitos
- ⏳ **Fase 5** — Tela de configuração (escolher modo servidor/cliente, IP)
- ⏳ **Fase 6** — Testes de robustez (queda de rede, reconexão, conflitos)

**Arquitetura do sync:** Cada PC tem SQLite local e funciona 100% offline. Quando conectados, o servidor expõe REST + WebSocket; o cliente consome. Sync incremental via `sync_log.seq`. Resolução: última escrita ganha (timestamp).

## Known concerns (audit)

`.planning/codebase/CONCERNS.md` lists every audit finding. Itens ainda abertos:

- Hardcoded admin passwords in `src/main/index.ts` → Phase 4 (AUTH) — pendente
- `parking.db` tracked in git history with real PII → Phase 2 (SEC) — pendente

Concerns intentionally **not** in this milestone (deferred to v2 or out of scope):
- `electronAPI` removal from preload (v2 hardening)
- Auto-updater (out of scope — no internet)
- Installer code signing (out of scope — no signing process yet)

## Commit conventions

- Atomic commits per logical change
- Conventional Commit prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
- Commit messages and code in Portuguese where the user-facing string is Portuguese; technical commit subject lines may be English
- `.planning/` docs are committed alongside the code they describe

## When in doubt

- Read `.planning/PROJECT.md` for product context
- Read `.planning/ROADMAP.md` for current scope
- Read `.planning/codebase/CONCERNS.md` before touching anything in `src/main/index.ts`, `parking.db`, or the preload boundary
- Ask the user before running anything that rewrites git history, deletes files, or touches `parking.db`
