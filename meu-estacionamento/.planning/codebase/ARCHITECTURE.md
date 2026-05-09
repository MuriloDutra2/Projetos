<!-- refreshed: 2026-05-09 -->
# Architecture

**Analysis Date:** 2026-05-09

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                       Renderer Process                       │
│                       (React 19 + Vite)                      │
├──────────────────┬──────────────────┬───────────────────────┤
│   App.tsx        │  Modal Components│   Hooks / Utils       │
│  (single SPA,    │  AlertModal,     │   useBarcodeScanner,  │
│   view router)   │  ModalCheckout,  │   masks,              │
│  `src/renderer/  │  ModalNovoCli.,  │   errorHandler        │
│   src/App.tsx`   │  ModalRenovar    │  `src/renderer/src/`  │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │ window.api.* (contextBridge calls)
         ▼
┌─────────────────────────────────────────────────────────────┐
│                       Preload Bridge                         │
│         contextBridge.exposeInMainWorld('api', api)          │
│              `src/preload/index.ts` (typed in                │
│               `src/preload/index.d.ts`)                      │
└────────┬─────────────────────────────────────────────────────┘
         │ ipcRenderer.invoke(channel, payload)
         ▼
┌─────────────────────────────────────────────────────────────┐
│                       Main Process                           │
│                  (Electron + Node.js)                        │
├──────────────────┬──────────────────┬───────────────────────┤
│  IPC Handlers    │  Business Logic  │  Side-effect modules  │
│  `src/main/      │  calculations.ts │  printer.ts (POS),    │
│   index.ts`      │  garageDates.ts  │  config.ts (JSON),    │
│  (~25 channels)  │                  │  db.ts (SQLite)       │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐
│ better-sqlite3   │  │ electron-pos-    │  │ Filesystem     │
│ (parking.db)     │  │ printer (80mm)   │  │ config.json,   │
│ in userData/ or  │  │ Windows print    │  │ CSV/PDF export │
│ cwd in dev       │  │ spooler          │  │ via dialog     │
└──────────────────┘  └──────────────────┘  └────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Main entry | Bootstrap Electron, create `BrowserWindow`, register all IPC handlers, configure cache paths | `src/main/index.ts` |
| Database layer | SQLite schema bootstrap, prepared statements, business operations exposed via `dbOperations` | `src/main/db.ts` |
| Pricing engine | Pure functions for tariff (R$4/h, R$50 pernoite, daily free-minute quota split across midnight) | `src/main/calculations.ts` |
| Garage billing | Resolve effective billing day per month (handles 31 → 28/29 in Feb) | `src/main/garageDates.ts` |
| Printer adapter | 80mm thermal receipt rendering via `electron-pos-printer` (entry/exit/subscription) | `src/main/printer.ts` |
| App config | Read/write `config.json` in `userData` (printer name only) | `src/main/config.ts` |
| Preload bridge | Expose typed `window.api` and `window.electron` via `contextBridge` | `src/preload/index.ts` |
| Preload types | Global `Window` augmentation declaring the full `api` surface | `src/preload/index.d.ts` |
| Renderer entry | React 19 root mounted into `#root` | `src/renderer/src/main.tsx` |
| Single-page UI | All seven views (`inicio`, `historico`, `relatorio`, `mensalistas`, `financeiro`, `excluidos`, `configuracoes`) live in one component | `src/renderer/src/App.tsx` |
| Modals | Dialog UI for checkout, client CRUD, renewal, alerts | `src/renderer/src/components/*.tsx` |
| Barcode scanner hook | Captures keystroke bursts from USB scanner and emits plate string | `src/renderer/src/hooks/useBarcodeScanner.ts` |
| Renderer utils | Plate/CPF/phone masks, friendly error translator | `src/renderer/src/utils/masks.ts`, `src/renderer/src/utils/errorHandler.ts` |

## Pattern Overview

**Overall:** Three-process Electron desktop app (main / preload / renderer) using `electron-vite` conventions, with a thick main process that owns all state and a thin renderer that is a single-component React SPA driven by a `view` state variable.

**Key Characteristics:**
- Strict process isolation: `sandbox: false` but `contextIsolation` defaults to ON; renderer reaches the OS only through the preload's whitelisted `api` (`src/preload/index.ts`).
- All persistence and side effects (SQLite, filesystem, printing, dialogs) live in the main process. The renderer holds no business logic beyond formatting.
- Pricing/billing rules are extracted into pure modules (`calculations.ts`, `garageDates.ts`) that the IPC handlers compose — these are also the only files covered by unit tests (`__tests__/unit/`).
- No client-side router, no Redux/Zustand: navigation is a `View` union type and `useState<View>` in `App.tsx`. State is per-view, refetched from IPC on `view` change via a single `useEffect`.
- Schema migrations are inline `ensureColumn()` calls at module load (`src/main/db.ts:13-82`) — no migration framework.

## Layers

**Renderer (UI layer):**
- Purpose: Render screens, capture user input, format dates/values for display.
- Location: `src/renderer/src/`
- Contains: `App.tsx` (1839 lines, all views), modal components, hooks, utils.
- Depends on: `window.api` (preload bridge), `react`, `date-fns`, `clsx`, Tailwind CSS.
- Used by: End user via the Electron `BrowserWindow`.

**Preload (bridge layer):**
- Purpose: Expose a typed, minimal surface of IPC `invoke` wrappers to the renderer; never executes business logic.
- Location: `src/preload/`
- Contains: `index.ts` (channel-to-method mapping), `index.d.ts` (`Window['api']` typings).
- Depends on: `electron.contextBridge`, `electron.ipcRenderer`, `@electron-toolkit/preload`.
- Used by: Renderer code via `window.api.*` and `window.electron.ipcRenderer.invoke(...)` (only used directly for `print-entry` / `print-exit`).

**Main (domain + I/O layer):**
- Purpose: Own the BrowserWindow lifecycle, register IPC handlers, perform all DB reads/writes, file I/O, dialogs, and printing.
- Location: `src/main/`
- Contains: `index.ts` (entry + handlers), `db.ts` (data access), `calculations.ts` (pricing), `garageDates.ts`, `printer.ts`, `config.ts`.
- Depends on: `electron`, `better-sqlite3`, `electron-pos-printer`, `date-fns`, `@electron-toolkit/utils`.
- Used by: Preload via `ipcMain.handle(...)`.

## Data Flow

### Primary Request Path — Register vehicle entry

1. User types/scans a plate in the `inicio` view (`src/renderer/src/App.tsx:691+` form).
2. `handleRegisterEntry` calls `window.api.checkPlateSubscription(placa)` (`App.tsx:471`) → preload `ipcRenderer.invoke('check-plate-subscription', ...)` (`src/preload/index.ts:41`) → main handler `check-plate-subscription` (`src/main/index.ts:226`) → `dbOperations.getVehicleSubscription` (`src/main/db.ts:482`).
3. If subscriber + active + non-debtor, the renderer calls `window.api.createTicket({ placa, tipo })` → main handler `create-ticket` (`src/main/index.ts:105`) → `dbOperations.hasActiveTicket` then `dbOperations.createTicket` (`src/main/db.ts:338-347`) → SQLite `INSERT INTO tickets`.
4. On success, renderer calls `window.electron.ipcRenderer.invoke('print-entry', ...)` (`App.tsx:440`) → main handler `print-entry` (`src/main/index.ts:598`) → `printEntryTicket` (`src/main/printer.ts`) → 80mm thermal print via `electron-pos-printer`.
5. Renderer reloads tickets via `loadTickets()` → `window.api.getTickets()` → `dbOperations.getAllActiveTickets`.

### Secondary Flow — Checkout / pricing

1. User clicks "Saída" on a ticket card → `handleCheckoutClick` (`App.tsx:319`).
2. Renderer calls `window.api.calculateValue({ entrada, placa, tipo })` → main handler `calculate-value` (`src/main/index.ts:185`).
3. Main resolves `freeMinutes` from the subscription (90 avulso, 150 mensal, 720 funcionário, 999999 garagem — `src/main/db.ts:490-493`) and calls `calcularValor(...)` (`src/main/calculations.ts:58`), which splits the stay across midnight and queries `getDailyUsedMinutes(placa, dateKey)` per day to enforce anti-fraud daily quota.
4. On confirm, `checkout-ticket` handler (`src/main/index.ts:142`) writes `status='FINALIZADO'`, `valor`, `saida` and persists the consumed minutes into `daily_free_usage` via `addDailyUsedMinutes` for each day segment (`splitStayIntoLocalDaySegments`).
5. Renderer triggers `print-exit` via `window.electron.ipcRenderer.invoke` and refreshes lists.

### Daily-report / financial export flow

1. View `relatorio` triggers `window.api.getDailyReport(dateStr)` → aggregates `tickets` (avulsos) and `subscription_payments` (planos) for the day.
2. "Exportar PDF" calls `export-daily-report-pdf` (`src/main/index.ts:655`): main spawns a hidden `BrowserWindow`, loads inline HTML, calls `webContents.printToPDF`, and writes the file via `dialog.showSaveDialog` + `writeFileSync`.
3. "Exportar CSV" via `export-financial-csv` (`src/main/index.ts:399`) joins tickets + payments, sorts by date, and writes UTF-8-BOM CSV.

**State Management:**
- Renderer: `useState` per concern in `App.tsx` (placa, tickets, history, clients, financialHistory, modals, view…). No global store. `useEffect` keyed on `view` re-fetches data when navigating.
- Main: SQLite is the source of truth. No in-memory caches except module-scoped prepared statements (`stmts` in `src/main/db.ts:96`).

## Key Abstractions

**`dbOperations` namespace (`src/main/db.ts:313`):**
- Purpose: Single object exposing every business-level DB operation (CRUD + reports). IPC handlers call it, never raw SQL.
- Examples: `getAllActiveTickets`, `createTicket`, `checkoutTicket`, `getVehicleSubscription`, `renewSubscriptionAdvanced`, `getDailyReport`, `getClientStatement`.
- Pattern: Module-level prepared statements (`stmts`) reused for performance; transactions via `db.transaction(() => …)` (e.g. `updateClient` at `db.ts:460`).

**Pure pricing functions (`src/main/calculations.ts`):**
- Purpose: Time-only math (no DB), composable with a `getDailyUsedForDate` callback so callers inject persistence.
- Examples: `isPernoite`, `splitStayIntoLocalDaySegments`, `calcularValor`, `minutosDaEstadia`.
- Pattern: Dependency injection of the daily-usage lookup → enables unit testing without SQLite (`__tests__/unit/calculations.test.ts`).

**`api` object on the preload (`src/preload/index.ts:5`):**
- Purpose: Single typed surface mapping renderer-facing method names (camelCase) to IPC channels (kebab-case).
- Examples: `getTickets()` → `'get-tickets'`, `createTicket(data)` → `'create-ticket'`, `renewSubscription(data)` → `'renew-subscription'`.
- Pattern: Each method is a thin `ipcRenderer.invoke(channel, payload)`; types are duplicated in `src/preload/index.d.ts` for renderer consumption.

**`View` union (`src/renderer/src/App.tsx:88`):**
- Purpose: Stand-in for a router. Drives both the sidebar highlight and which JSX block is rendered.
- Values: `'inicio' | 'historico' | 'relatorio' | 'mensalistas' | 'financeiro' | 'excluidos' | 'configuracoes'`.

## Entry Points

**Main process:**
- Location: `src/main/index.ts`
- Triggers: `electron-vite` builds it to `out/main/index.js`; `package.json` `"main"` field points there; Electron starts here.
- Responsibilities: `configureStableCachePaths()` (work around OneDrive cache lock), `app.whenReady().then(...)` registers all `ipcMain.handle(...)` channels and calls `createWindow()`.

**Preload:**
- Location: `src/preload/index.ts`
- Triggers: Loaded by `BrowserWindow` via `webPreferences.preload: path.join(__dirname, '../preload/index.js')` (`src/main/index.ts:53`).
- Responsibilities: `contextBridge.exposeInMainWorld('electron', electronAPI)` + `('api', api)`.

**Renderer:**
- Location: `src/renderer/src/main.tsx`
- Triggers: Loaded by `src/renderer/index.html` (`<script type="module" src="/src/main.tsx">`); `BrowserWindow` loads either `process.env.ELECTRON_RENDERER_URL` (dev HMR) or the built `index.html` (`src/main/index.ts:69-73`).
- Responsibilities: Mount `<App />` inside `<StrictMode>` into `#root`.

## IPC Channel Inventory

All channels are `ipcMain.handle` (request/response) registered in `src/main/index.ts` and called via `window.api` from `src/preload/index.ts`. One legacy listener `'ping'` exists (`src/main/index.ts:91`).

| Channel | Direction | Purpose | Handler line |
|---------|-----------|---------|--------------|
| `get-tickets` | invoke | List active tickets | `src/main/index.ts:94` |
| `create-ticket` | invoke | Register entry, normalize plate, detect debtor subscriber | `src/main/index.ts:105` |
| `checkout-ticket` | invoke | Compute fee, mark `FINALIZADO`, update daily quota | `src/main/index.ts:142` |
| `calculate-value` | invoke | Preview fee for an active ticket | `src/main/index.ts:185` |
| `check-plate-was-in-today` | invoke | Has plate had any ticket today | `src/main/index.ts:216` |
| `check-plate-subscription` | invoke | Resolve subscription state for a plate | `src/main/index.ts:226` |
| `create-client` | invoke | Insert client + plates | `src/main/index.ts:267` |
| `get-clients` | invoke | List clients with computed status/debtor flags | `src/main/index.ts:291` |
| `update-client` | invoke | Update client + replace plates (transactional) | `src/main/index.ts:301` |
| `toggle-client-status` | invoke | Set `active` 0/1 | `src/main/index.ts:327` |
| `renew-subscription` | invoke | Insert N monthly payments + update expiry | `src/main/index.ts:340` |
| `get-financial-history` | invoke | Last 200 payments | `src/main/index.ts:369` |
| `get-financial-summary-by-method` | invoke | Sum payments by method for a month | `src/main/index.ts:378` |
| `get-client-statement` | invoke | Client extract: payments + avulso-while-debtor | `src/main/index.ts:390` |
| `export-financial-csv` | invoke | Save dialog + write UTF-8-BOM CSV | `src/main/index.ts:399` |
| `get-history` | invoke | Last 50 finished tickets | `src/main/index.ts:441` |
| `get-history-for-day` | invoke | Finished tickets on date | `src/main/index.ts:450` |
| `get-history-last24h` | invoke | Finished tickets in last 24h | `src/main/index.ts:459` |
| `get-daily-report` | invoke | Daily aggregates + saved snapshot | `src/main/index.ts:468` |
| `save-daily-report` | invoke | Upsert `daily_reports` snapshot | `src/main/index.ts:478` |
| `delete-client` | invoke | Password-gated client delete | `src/main/index.ts:511` |
| `exclude-ticket` | invoke | Password-gated ticket exclusion | `src/main/index.ts:533` |
| `exclude-all-active-tickets` | invoke | Password-gated bulk exclusion | `src/main/index.ts:549` |
| `get-excluded-tickets` | invoke | List status=`EXCLUIDO` | `src/main/index.ts:564` |
| `get-printers` | invoke | List Windows printers via `webContents.getPrintersAsync` | `src/main/index.ts:573` |
| `get-printer-config` | invoke | Read selected printer from `config.json` | `src/main/index.ts:588` |
| `save-printer-config` | invoke | Persist selected printer | `src/main/index.ts:592` |
| `print-entry` | invoke | 80mm entry receipt | `src/main/index.ts:598` |
| `print-exit` | invoke | 80mm exit receipt | `src/main/index.ts:614` |
| `print-subscription` | invoke | Mensalista receipt | `src/main/index.ts:636` |
| `export-daily-report-pdf` | invoke | Render hidden `BrowserWindow` → `printToPDF` → save | `src/main/index.ts:656` |
| `ping` | on (legacy) | Logs `pong` | `src/main/index.ts:91` |

## Database Schema (SQLite via better-sqlite3)

Defined and migrated inline at `src/main/db.ts:20-94`:

- `tickets(id, placa, tipo, entrada, saida, valor, status)` — `status ∈ {ATIVO, FINALIZADO, EXCLUIDO}`.
- `clients(id, name, cpf, phone, plan_type, expiry_date, active, created_at, garage_billing_day, garage_billing_month)` — last two columns added via `ensureColumn`.
- `client_vehicles(id, client_id FK, plate UNIQUE)` — uniqueness enforces "one plate, one client".
- `daily_free_usage(placa, data, minutos_usados)` — composite PK `(placa, data)` for anti-fraud daily quota tracking.
- `subscription_payments(id, client_id, amount, plan_type, payment_date, new_expiry_date, payment_method, competency_month, is_advance, notes, payer_display_name)` — last five via `ensureColumn`.
- `daily_reports(report_date PK, total_avulsos, planos_vendidos_count, planos_vendidos_value, qty_cars, qty_motos, created_at)` — upsert snapshot.

DB path: `process.cwd()/parking.db` in dev, `app.getPath('userData')/parking.db` in prod (`src/main/db.ts:6-9`).

## Architectural Constraints

- **Threading:** Single-threaded Node event loop in main; renderer is a single Chromium process. `better-sqlite3` is synchronous and runs on the main thread — long queries will block IPC.
- **Global state:** `db` (the SQLite handle) and `stmts` (prepared statements) are module-level singletons in `src/main/db.ts`. `mainWindow: BrowserWindow | null` is module-scoped in `src/main/index.ts:32`.
- **Context isolation:** `contextIsolation` is implicit-default true and `sandbox: false`. The renderer cannot import Node modules; the only escape hatch is `window.electron.ipcRenderer.invoke`, which is currently used directly for `print-entry` and `print-exit` (`App.tsx:346`, `:440`) instead of `window.api`.
- **No bundling for `better-sqlite3`:** Marked `external` in `electron.vite.config.ts:9` and rebuilt via `electron-builder install-app-deps`.
- **CSP:** Renderer enforces `script-src 'self'; default-src 'self'` (`src/renderer/index.html:8-10`). No remote scripts.
- **Hardcoded passwords:** Three operator passwords are embedded as string literals (`src/main/index.ts:506-508`). Modifying them requires a rebuild.

## Anti-Patterns

### Renderer reaches around `window.api` for printing

**What happens:** `App.tsx:346` and `:440` call `window.electron.ipcRenderer.invoke('print-exit', ...)` / `'print-entry'` directly, bypassing the `api` surface even though `printSubscription` is wrapped (`src/preload/index.ts:88`).
**Why it's wrong:** Defeats the purpose of the preload contract — channel names leak into the renderer, and the typed `index.d.ts` does not cover them. Refactors of channel names will silently break these calls.
**Do this instead:** Add `printEntry` and `printExit` to `api` in `src/preload/index.ts` and update `index.d.ts`, then call `window.api.printEntry(...)`.

### Monolithic 1839-line `App.tsx`

**What happens:** All seven views, every modal trigger, all state, and all data-fetching effects live in one component (`src/renderer/src/App.tsx`).
**Why it's wrong:** Re-renders are coarse, the file is hard to navigate, and unrelated views share state. Adding a router would shrink each screen and enable code-splitting.
**Do this instead:** Split each `view === '...'` block into its own component file under `src/renderer/src/views/` and lift only shared state (alerts, confirms) up.

### Inline schema migrations on every boot

**What happens:** `db.ts` runs `CREATE TABLE IF NOT EXISTS` and `ensureColumn(...)` calls at import time (`src/main/db.ts:20-82`).
**Why it's wrong:** No migration history, no rollback, and column DDL is duplicated between the create statement and `ensureColumn`. New columns are appended only via `ensureColumn`, which means production DBs and fresh installs diverge in column order.
**Do this instead:** Adopt a migration runner (e.g. a numbered `migrations/` directory replayed against a `schema_version` table) before adding more columns.

### Passwords as source-code constants

**What happens:** `EXCLUDE_TICKET_PASSWORD = 'Kefit2026'` etc. are string literals in `src/main/index.ts:506-508`.
**Why it's wrong:** Changing a password requires recompiling and redistributing; the source repo doubles as a credential store; and audits cannot be done per-operator.
**Do this instead:** Move to `config.json` (hashed) or a small admin table in SQLite, hashed with a salt.

## Error Handling

**Strategy:** Each IPC handler wraps its body in `try/catch`, logs to `console.error`, and returns a discriminated result `{ success: boolean; error?: string }` (or an empty fallback like `[]` / `0` for read-only handlers). The renderer never sees thrown exceptions over IPC for write handlers.

**Patterns:**
- Read handlers (`get-tickets`, `get-history`) return `[]` on failure to keep the UI rendering.
- Write handlers (`create-ticket`, `checkout-ticket`, `renew-subscription`) return `{ success: false, error: string }` and the renderer translates via `friendlyError(...)` (`src/renderer/src/utils/errorHandler.ts`).
- DB-specific errors are translated server-side by `translateDbError(...)` (`src/main/db.ts:302`), e.g. `SQLITE_CONSTRAINT_UNIQUE` → "Esta placa já está cadastrada no sistema."
- Domain validation errors short-circuit before throwing, e.g. `clientHasActiveParkingTicket(...)` gate in `delete-client` (`src/main/index.ts:517`).

## Cross-Cutting Concerns

**Logging:** `console.error` / `console.warn` only, no structured logger. Main-process logs go to Electron's stderr; in production they are visible in the console window of the unpacked build.

**Validation:** Plate normalization is duplicated as `normalizePlate(p) = p.replace(/[^A-Z0-9]/gi, '').toUpperCase()` in `src/main/index.ts:103` and inline in `src/main/db.ts:339`, `:483`, `:561`, `:567`. Renderer-side mask/validation lives in `src/renderer/src/utils/masks.ts` (`maskPlate`, `plateToRaw`, `validatePlate`).

**Authentication:** None for the main user flow. Three operations are gated by hardcoded passwords compared in plaintext (`src/main/index.ts:514`, `:536`, `:552`). No multi-user concept.

**Auto-updates:** `electron-updater` is a dependency and `dev-app-update.yml` exists at the repo root, but no `autoUpdater.checkForUpdatesAndNotify()` call is wired in `src/main/index.ts` — auto-update is configured but inactive.

**Cache hardening:** `configureStableCachePaths()` (`src/main/index.ts:9-23`) reroutes the Chromium disk cache out of OneDrive-synced folders to avoid "Acesso negado" errors specific to this deployment scenario.

---

*Architecture analysis: 2026-05-09*
