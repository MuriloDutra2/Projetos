# Codebase Structure

**Analysis Date:** 2026-05-09

## Directory Layout

```
meu-estacionamento/
├── src/                              # All TypeScript source (split per Electron process)
│   ├── main/                         # Main process (Node + Electron APIs)
│   │   ├── index.ts                  # Entry: BrowserWindow + IPC handlers
│   │   ├── db.ts                     # SQLite schema + dbOperations
│   │   ├── calculations.ts           # Pure pricing/time math
│   │   ├── garageDates.ts            # Effective billing-day helper
│   │   ├── printer.ts                # 80mm thermal receipts (electron-pos-printer)
│   │   └── config.ts                 # config.json (printerName) read/write
│   ├── preload/                      # Preload bridge
│   │   ├── index.ts                  # contextBridge.exposeInMainWorld('api', ...)
│   │   └── index.d.ts                # Window.api type declarations
│   └── renderer/                     # Renderer process (React 19 + Vite)
│       ├── index.html                # CSP meta + <div id="root">
│       └── src/
│           ├── main.tsx              # createRoot + <App />
│           ├── App.tsx               # 1839-line single-component SPA
│           ├── env.d.ts              # /// <reference types="vite/client" />
│           ├── assets/               # CSS + logos used by the renderer
│           │   ├── base.css
│           │   ├── main.css          # Tailwind entry
│           │   ├── logo.png
│           │   ├── logo.svg
│           │   ├── electron.svg
│           │   └── wavy-lines.svg
│           ├── components/           # Modal/dialog UI components
│           │   ├── AlertModal.tsx
│           │   ├── ModalCheckout.tsx
│           │   ├── ModalNovoCliente.tsx
│           │   ├── ModalRenovar.tsx
│           │   └── Versions.tsx      # (boilerplate, unused in App.tsx)
│           ├── hooks/
│           │   └── useBarcodeScanner.ts
│           └── utils/
│               ├── masks.ts          # CPF/phone/plate masking + validation
│               └── errorHandler.ts   # friendlyError(...) translator
├── __tests__/                        # Vitest unit tests (main-process pure modules only)
│   ├── unit/
│   │   ├── calculations.test.ts
│   │   └── garageDates.test.ts
│   ├── fixtures/                     # (currently empty)
│   ├── README.md
│   └── CASOS-DE-TESTE.md             # Manual test scenarios (PT-BR)
├── build/                            # electron-builder build resources
│   ├── icon.ico
│   └── icon.png
├── resources/                        # Runtime assets bundled via extraResources
│   ├── icon.ico
│   ├── icon.png
│   └── logo.png                      # Used by printer.ts at runtime
├── out/                              # electron-vite build output (main/preload/renderer)
├── dist/                             # electron-builder installer/unpacked output
├── parking.db                        # SQLite DB (used in dev mode at cwd)
├── package.json
├── package-lock.json
├── electron.vite.config.ts           # Aliases @renderer; externalizes better-sqlite3
├── electron-builder.yml              # Win NSIS / mac dmg / linux AppImage config
├── eslint.config.mjs
├── postcss.config.js                 # Tailwind + autoprefixer
├── tailwind.config.js
├── tsconfig.json                     # Project references (web + node)
├── tsconfig.node.json                # main + preload
├── tsconfig.web.json                 # renderer (paths: @renderer/*)
├── vitest.config.ts
├── dev-app-update.yml                # electron-updater config (inactive)
├── test-results.json                 # Last vitest --reporter=json output
├── README.md
└── TESTES-ANTES-DO-PENDRIVE.md       # Operator pre-flight checklist (PT-BR)
```

## Directory Purposes

**`src/main/`:**
- Purpose: Main Electron process — window lifecycle, IPC handlers, DB access, printing, file dialogs.
- Contains: TypeScript modules compiled by `electron-vite` to `out/main/`.
- Key files: `src/main/index.ts` (entry + ~25 IPC handlers), `src/main/db.ts` (data layer, 707 lines), `src/main/calculations.ts` (pure pricing), `src/main/printer.ts` (POS receipts), `src/main/config.ts`, `src/main/garageDates.ts`.

**`src/preload/`:**
- Purpose: Bridge between renderer and main; defines the only API the UI can call.
- Contains: One implementation file and one ambient `.d.ts` augmenting `Window`.
- Key files: `src/preload/index.ts`, `src/preload/index.d.ts`.

**`src/renderer/`:**
- Purpose: Chromium-rendered UI (React + Tailwind).
- Contains: `index.html` (CSP, root div) and `src/` with all React code.
- Key files: `src/renderer/src/App.tsx`, `src/renderer/src/main.tsx`, `src/renderer/index.html`.

**`src/renderer/src/components/`:**
- Purpose: Reusable modal/dialog components consumed by `App.tsx`.
- Contains: One `.tsx` per modal. No barrel `index.ts`.
- Key files: `src/renderer/src/components/ModalCheckout.tsx`, `ModalNovoCliente.tsx`, `ModalRenovar.tsx`, `AlertModal.tsx`. `Versions.tsx` is electron-vite boilerplate and not used.

**`src/renderer/src/hooks/`:**
- Purpose: React hooks shared across views.
- Contains: One file (`useBarcodeScanner.ts`).
- Naming: `useXxx.ts`.

**`src/renderer/src/utils/`:**
- Purpose: Renderer-only pure helpers — input masking and error translation.
- Contains: `masks.ts` (CPF/phone/plate/DDMM masks, `validatePlate`), `errorHandler.ts` (`friendlyError`).

**`src/renderer/src/assets/`:**
- Purpose: CSS and image assets imported by the bundler.
- Contains: `main.css` (Tailwind directives), `base.css`, logo PNG/SVG, `wavy-lines.svg`.

**`__tests__/`:**
- Purpose: Vitest unit tests + manual QA documentation.
- Contains: `unit/*.test.ts` (only the two pure main-process modules are covered), `fixtures/` (empty), `README.md`, `CASOS-DE-TESTE.md`.

**`build/`:**
- Purpose: Build-time resources for `electron-builder` (icons referenced from `electron-builder.yml`).
- Generated: No (committed).

**`resources/`:**
- Purpose: Runtime resources unpacked from the asar archive (`asarUnpack: resources/**`). `printer.ts` reads `resources/logo.png` for receipt headers.
- Generated: No (committed).

**`out/`:**
- Purpose: `electron-vite` compilation output (`out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html`).
- Generated: Yes — `npm run build`.
- Committed: No (typically gitignored).

**`dist/`:**
- Purpose: `electron-builder` final artifacts (NSIS setup, `win-unpacked`, etc.).
- Generated: Yes — `npm run dist:installer` / `dist:unpack`.
- Committed: No.

## Key File Locations

**Entry Points:**
- `src/main/index.ts`: Main process — Electron bootstrap and IPC registration.
- `src/preload/index.ts`: Preload — exposes `window.api` and `window.electron`.
- `src/renderer/src/main.tsx`: Renderer — mounts `<App />`.
- `src/renderer/index.html`: HTML shell with CSP meta tag.

**Configuration:**
- `package.json`: scripts (`dev`, `build`, `dist:installer`, `test`, `lint`, `format`, `typecheck`), dependencies, `"main": "./out/main/index.js"`.
- `electron.vite.config.ts`: Vite config per process; `@renderer` alias; `better-sqlite3` marked `external`.
- `electron-builder.yml`: App ID `com.kf.estacionamento`, NSIS installer, `extraResources: build/icon.ico` and `resources/logo.png`.
- `tsconfig.json` + `tsconfig.node.json` + `tsconfig.web.json`: project references — node TS for main/preload, web TS for renderer.
- `tailwind.config.js`, `postcss.config.js`: Tailwind 3.4 + autoprefixer.
- `eslint.config.mjs`: Flat ESLint config (`@electron-toolkit/eslint-config-ts`).
- `vitest.config.ts`: Vitest setup for the `__tests__/` tree.
- `dev-app-update.yml`: electron-updater placeholder (provider: generic).

**Core Logic:**
- `src/main/db.ts`: SQLite schema (`tickets`, `clients`, `client_vehicles`, `daily_free_usage`, `subscription_payments`, `daily_reports`), `dbOperations` namespace, prepared statements `stmts`, `translateDbError`.
- `src/main/calculations.ts`: `isPernoite`, `splitStayIntoLocalDaySegments`, `calcularValor`, `minutosDaEstadia`.
- `src/main/garageDates.ts`: `effectiveBillingDayInMonth`.
- `src/main/printer.ts`: `printEntryTicket`, `printExitTicket`, `printSubscriptionReceipt`; reads `resources/logo.png`; uses `electron-pos-printer` at 80mm.
- `src/renderer/src/App.tsx`: All view rendering and orchestration of `window.api` calls.

**Testing:**
- `__tests__/unit/calculations.test.ts`: Tests pricing math.
- `__tests__/unit/garageDates.test.ts`: Tests month-day clamping.
- `__tests__/CASOS-DE-TESTE.md` and `__tests__/README.md`: Manual test plans in Portuguese.

**Persistence:**
- `parking.db` (root): SQLite file used by `src/main/db.ts` when `NODE_ENV === 'development'`. In production it lives at `app.getPath('userData')/parking.db`.
- `config.json` at `app.getPath('userData')`: Written by `src/main/config.ts` (printer name only).

## Naming Conventions

**Files:**
- Source modules: lowercase (`index.ts`, `db.ts`, `calculations.ts`, `printer.ts`, `config.ts`, `garageDates.ts`). The single camelCase exception is `garageDates.ts`.
- React components: PascalCase with `.tsx` (`App.tsx`, `ModalCheckout.tsx`, `ModalNovoCliente.tsx`, `ModalRenovar.tsx`, `AlertModal.tsx`).
- Hooks: camelCase prefixed with `use` (`useBarcodeScanner.ts`).
- Tests: `<module>.test.ts` co-located under `__tests__/unit/` rather than next to the source.
- Type-only declarations: `index.d.ts` in the preload folder.

**Directories:**
- All lowercase, single-word: `main`, `preload`, `renderer`, `src`, `components`, `hooks`, `utils`, `assets`, `build`, `resources`, `out`, `dist`.
- Tests folder is `__tests__/` (Jest-style convention) even though the runner is Vitest.

**IPC channels:**
- Kebab-case verbs: `get-tickets`, `create-ticket`, `checkout-ticket`, `check-plate-subscription`, `renew-subscription`, `export-financial-csv`, `print-entry`.
- Renderer-facing wrapper methods on `window.api` are camelCase: `getTickets`, `createTicket`, `checkoutTicket`, `printSubscription`.

**Database:**
- Tables: snake_case plural (`tickets`, `clients`, `client_vehicles`, `daily_free_usage`, `subscription_payments`, `daily_reports`).
- Columns: snake_case (`plan_type`, `expiry_date`, `garage_billing_day`, `payment_method`, `competency_month`, `is_advance`, `payer_display_name`).
- Status enums (string-typed): UPPERCASE — `'ATIVO'`, `'FINALIZADO'`, `'EXCLUIDO'`.
- Plan types: UPPERCASE constants — `'MENSAL_CARRO'`, `'MENSAL_MOTO'`, `'MENSAL_CARRO_MOTO'`, `'GARAGEM'`, `'FUNCIONARIO'`. Avulso entries use `'Carro'` / `'Moto'` (mixed-case — see `src/main/index.ts:135` `isAvulsoParaPernoite`).

**TypeScript types:**
- PascalCase interfaces inline in `App.tsx` (`Ticket`, `HistoryEntry`, `ClientRow`, `SubscriptionInfo`, `ClientStatement`).
- Discriminated string union for navigation: `type View = 'inicio' | 'historico' | ...` (`src/renderer/src/App.tsx:88`).

**User-facing strings:** Portuguese (Brazil). All UI labels, error messages, console logs, and code comments are pt-BR.

## Where to Add New Code

**New IPC operation (read or write):**
1. Add a method to `dbOperations` (or a new module) under `src/main/`.
2. Register the handler with `ipcMain.handle('kebab-channel', ...)` in `src/main/index.ts`, mirroring the `try/catch` + `{ success, error? }` pattern used by existing write handlers (or an empty-array fallback for reads).
3. Add a wrapper method to `api` in `src/preload/index.ts` and its type to `Window['api']` in `src/preload/index.d.ts`.
4. Call `window.api.<method>(...)` from the renderer.

**New view/screen:**
- Currently every view is a `view === 'xxx'` block inside `src/renderer/src/App.tsx`. To add one:
  1. Extend the `View` union (`src/renderer/src/App.tsx:88`).
  2. Add a sidebar button next to the existing ones (around `src/renderer/src/App.tsx:599-690`).
  3. Add the rendering block (`{view === 'novo' && (...)}`).
  4. Add a branch in the `useEffect` at `src/renderer/src/App.tsx:184-209` to fetch data on view enter.
- Long term: extract the block into `src/renderer/src/views/Novo.tsx` and import.

**New modal:**
- Add a file under `src/renderer/src/components/<NomeModal>.tsx` exporting a default component with `open`, `onClose`, and any callbacks.
- Import and render it in `App.tsx`, gated by a `useState<boolean>` flag.
- Follow the pattern in `ModalCheckout.tsx` (props interface declared above the component).

**New hook:**
- Place under `src/renderer/src/hooks/<useThing>.ts`. Export a named function `useThing(...)`.

**New pure helper (renderer):**
- `src/renderer/src/utils/<topic>.ts`. Keep it framework-free so it can be unit tested directly (no current renderer-side tests, but the convention allows them).

**New pure helper (main):**
- New module under `src/main/`. Re-export from `db.ts` only if it is data-layer related (see `src/main/db.ts:275` re-exporting `effectiveBillingDayInMonth`).
- Add a unit test under `__tests__/unit/<module>.test.ts` if the module has no Electron/SQLite dependency — that is the established testable boundary.

**New SQL table or column:**
- Add the `CREATE TABLE IF NOT EXISTS` block in `src/main/db.ts` (lines 20-94) for new tables.
- For new columns, use `ensureColumn(table, column, ddl)` (`src/main/db.ts:13-18`) below the create blocks so existing DBs are migrated on next launch.
- Add prepared statements to the `stmts` object (`src/main/db.ts:96`) and a method to `dbOperations`.

**New printer template:**
- Add an exported `printXxxTicket(...)` function in `src/main/printer.ts` reusing `getHeaderItems(...)` and `getBaseOptions()`. Wire it to a new IPC handler in `src/main/index.ts`.

**New asset (logo, image):**
- Receipt-bound (used by main process at runtime): drop in `resources/` and reference via `app.getAppPath()`-relative paths or `process.resourcesPath` (see `getLogoPath()` in `src/main/printer.ts:11-25`). Add to `electron-builder.yml` `extraResources` if needed.
- UI-bound (renderer only): drop in `src/renderer/src/assets/` and `import logo from './assets/logo.png'`.

**New environment / build config:**
- Build resource (icons, entitlements): `build/`, referenced from `electron-builder.yml`.
- Vite per-process tweaks: `electron.vite.config.ts`.
- TypeScript paths/types: extend the appropriate `tsconfig.web.json` (renderer) or `tsconfig.node.json` (main + preload).

## Special Directories

**`__tests__/`:**
- Purpose: Vitest unit tests and Portuguese manual-test documentation.
- Generated: No.
- Committed: Yes.

**`build/`:**
- Purpose: Build-time icons consumed by `electron-builder.yml`.
- Generated: No.
- Committed: Yes.

**`resources/`:**
- Purpose: Runtime resources unpacked from asar (`logo.png` is read by the printer at runtime).
- Generated: No.
- Committed: Yes.

**`out/`:**
- Purpose: `electron-vite` build output (`out/main/`, `out/preload/`, `out/renderer/`). `package.json` `"main"` points at `./out/main/index.js`.
- Generated: Yes (`npm run build`).
- Committed: Typically no.

**`dist/`:**
- Purpose: `electron-builder` artifacts (`*-setup.exe`, `win-unpacked/`).
- Generated: Yes (`npm run dist:installer` / `dist:unpack`).
- Committed: No.

**`node_modules/`:**
- Purpose: Standard npm dependency tree. `better-sqlite3` is rebuilt for Electron via `electron-builder install-app-deps` (postinstall).
- Generated: Yes.
- Committed: No.

**Top-level `parking.db`:**
- Purpose: Development SQLite database (used when `NODE_ENV === 'development'`, per `src/main/db.ts:6-9`).
- Generated: Yes (auto-created on first run).
- Committed: Yes (currently checked in — likely contains seed/test data).

---

*Structure analysis: 2026-05-09*
