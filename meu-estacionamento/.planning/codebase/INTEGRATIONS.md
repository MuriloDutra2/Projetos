# External Integrations

**Analysis Date:** 2026-05-09

## APIs & External Services

This is a **local-first Electron desktop app**. No remote HTTP APIs, SaaS SDKs, or cloud back-ends are called from the codebase. All persistence and computation happens on the local machine.

**External services in dependency tree:**
- electron-updater ^6.3.9 - Auto-update client (configured but not yet wired into `src/`). Configuration points at a placeholder URL `https://example.com/auto-updates` (`electron-builder.yml:55-56`, `dev-app-update.yml:2`). No `autoUpdater.checkForUpdatesAndNotify()` call exists in `src/main/**`.
- electronDownload mirror: `https://npmmirror.com/mirrors/electron/` (used only at install/build time, not at runtime — see `electron-builder.yml:57-58`).

## Data Storage

**Databases:**
- SQLite (via `better-sqlite3` ^12.6.2)
  - Connection: synchronous file-based DB. Path in `src/main/db.ts:6-9`:
    - Dev: `<repo>/parking.db` (when `NODE_ENV === 'development'`)
    - Prod: `<app.getPath('userData')>/parking.db`
  - Client: `better-sqlite3` (Database instance created in `src/main/db.ts:11`).
  - Schema migrations: idempotent `CREATE TABLE IF NOT EXISTS` plus `ensureColumn(table, column, ddl)` helper that runs `ALTER TABLE ... ADD COLUMN` when missing (`src/main/db.ts:13-18`).
  - Marked as Rollup external in `electron.vite.config.ts:9` so the native module loads at runtime.

**Schema (5 tables):**

| Table | Purpose | Key columns | Defined at |
|-------|---------|-------------|------------|
| `tickets` | Active and historical parking tickets | `id`, `placa`, `tipo`, `entrada`, `saida`, `valor`, `status` (`ATIVO`/`FINALIZADO`/`EXCLUIDO`) | `src/main/db.ts:20-30` |
| `clients` | Subscribers (mensalistas, garagem, funcionario) | `id`, `name`, `cpf`, `phone`, `plan_type`, `expiry_date`, `active`, `created_at`, `garage_billing_day`, `garage_billing_month` | `src/main/db.ts:32-43`, columns added via `ensureColumn` at `src/main/db.ts:80-82` |
| `client_vehicles` | Plates owned by each client (UNIQUE plate) | `id`, `client_id` (FK→`clients.id`), `plate` UNIQUE | `src/main/db.ts:45-52` |
| `daily_free_usage` | Per-plate per-day free-minutes consumption | composite PK (`placa`, `data`), `minutos_usados` | `src/main/db.ts:54-61` |
| `subscription_payments` | Renewal payments / financial history | `id`, `client_id` (FK), `amount`, `plan_type`, `payment_date`, `new_expiry_date`, `payment_method`, `competency_month`, `is_advance`, `notes`, `payer_display_name` | `src/main/db.ts:63-73` + `ensureColumn` at `src/main/db.ts:75-78,82` |
| `daily_reports` | Cached/saved daily report snapshots | PK `report_date`, `total_avulsos`, `planos_vendidos_count`, `planos_vendidos_value`, `qty_cars`, `qty_motos`, `created_at` | `src/main/db.ts:84-94` |

**File Storage:**
- Local filesystem only. Reports/exports written via Electron `dialog.showSaveDialog`:
  - Financial CSV export → `src/main/index.ts:399-439` (UTF-8 with BOM, semicolon-delimited).
  - Daily report PDF export → `src/main/index.ts:655-735` (rendered via `webContents.printToPDF` on a hidden `BrowserWindow`).
- Logo (`resources/logo.png`) and icons (`build/icon.ico`, `resources/icon.png`) bundled as `extraResources` (`electron-builder.yml:17-21`).
- Chromium browser cache redirected to `<userData>/browser-cache` (`src/main/index.ts:9-21`) to avoid OneDrive sync conflicts on Windows.

**Caching:**
- None at the application level. SQLite `better-sqlite3` is synchronous and fast; no Redis/memcache.

## Authentication & Identity

**Auth Provider:**
- None. Single-user local desktop app — there is no user login.

**Hardcoded operator passwords (in `src/main/index.ts:506-508`):**
- `EXCLUDE_TICKET_PASSWORD = 'Kefit2026'` - Used in `exclude-ticket` IPC handler.
- `DELETE_CLIENT_PASSWORD = 'Kefit2026'` - Used in `delete-client` IPC handler.
- `EXCLUDE_ALL_PASSWORD = 'murilo123@'` - Used in `exclude-all-active-tickets` IPC handler.

These are plaintext gate-passwords for destructive operations. **Not a real auth system** — they are checked against literal strings in the main process. (See `CONCERNS.md` if/when produced.)

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry, Bugsnag, Rollbar, or similar SDK present.
- Errors logged to `console.error` in main process IPC handlers (e.g. `src/main/index.ts:96-100, 121-123, 178-180, ...`).
- Renderer surfaces errors via `src/renderer/src/utils/errorHandler.ts` (`friendlyError`) and `AlertModal` component.

**Logs:**
- `console.log` / `console.error` only. No structured logging, no file-based logs.

## CI/CD & Deployment

**Hosting:**
- Distributed as a desktop installer; no server hosting.
- Electron Builder NSIS installer for Windows is the primary artifact (`electron-builder.yml:27-33`, `package.json` scripts `dist:installer` / `build:win`).

**CI Pipeline:**
- No CI configuration files committed (no `.github/workflows`, no `.gitlab-ci.yml`, no `azure-pipelines.yml`).
- Build is local-only: `npm run typecheck && electron-vite build && electron-builder ...`.

**Release/Update Channel:**
- electron-updater configured but **not active in code**. `electron-builder.yml` declares `publish: { provider: generic, url: https://example.com/auto-updates }` and `dev-app-update.yml` mirrors that URL. No `autoUpdater` import or call exists in `src/main/index.ts` or anywhere else under `src/`.

## Hardware Integrations

**Thermal POS Printer:**
- Library: `electron-pos-printer` ^1.3.8.
- Implementation: `src/main/printer.ts`.
- Targets 80 mm thermal printers (~302 px container, min page height ~1134 px to avoid spooler cut). See `WIDTH_80MM_PX` and `MIN_PAGE_HEIGHT_PX` constants at `src/main/printer.ts:69-71`.
- Selected printer is read from `<userData>/config.json` (`src/main/config.ts`) via `getConfig().printerName`.
- Available printers enumerated through `webContents.getPrintersAsync()` in IPC handler `get-printers` (`src/main/index.ts:573-586`).
- Three receipt formats: entry ticket (with barcode), exit ticket / payment receipt, two-via subscription contract/receipt (`printEntryTicket`, `printExitTicket`, `printSubscriptionReceipt` in `src/main/printer.ts`).
- Print operations wrapped with a 30 s timeout to handle Spooler hangs (`src/main/printer.ts:99-122`).
- Debug preview mode toggled via `DEBUG_PRINT=1` env var.

**Barcode Scanner (USB HID keyboard-emulation):**
- Implementation: `src/renderer/src/hooks/useBarcodeScanner.ts`.
- Listens on `window` `keydown` and detects "burst" typing (>=4 chars within 150 ms) to distinguish scanner from human input. Idle timeout 120 ms, min plate length 5, normalises to uppercase alphanumeric, trims to 7 chars.
- Used to auto-fill plate fields when barcode receipts are scanned at entry/exit.

## Environment Configuration

**Required env vars (none required at runtime):**
- `NODE_ENV` - Read in `src/main/db.ts:7` to switch DB path (`development` vs default/packaged). Set automatically by `electron-vite dev`.
- `ELECTRON_RENDERER_URL` - Auto-set by `electron-vite` in dev to point the main window at the Vite dev server (`src/main/index.ts:69-73`).
- `DEBUG_PRINT` - Optional. Set to `1` to enable POS printer preview mode (`src/main/printer.ts:62`).

**Secrets location:**
- No secrets, no `.env` files, no API keys. All "secret" values (admin passwords for destructive ops) are hardcoded in `src/main/index.ts:506-508`.

## Webhooks & Callbacks

**Incoming:**
- None. App does not run an HTTP/IPC server reachable from outside the local Electron process.

**Outgoing:**
- None at runtime. (`electron-updater` would issue HTTP GETs to the configured `publish.url` if it were wired in, but it currently is not.)

## Inter-Process Communication (IPC channels)

The app's "internal API" is the Electron IPC surface bridging the renderer (React UI) and the main process. Channels are registered with `ipcMain.handle(...)` in `src/main/index.ts` and exposed to the renderer through `contextBridge.exposeInMainWorld('api', ...)` in `src/preload/index.ts`. Typed in `src/preload/index.d.ts`.

**Tickets:**
- `get-tickets` → all `ATIVO` tickets (`src/main/index.ts:94-101`).
- `create-ticket` → insert ticket; rejects duplicates and reports debtor-as-avulso flag (`src/main/index.ts:105-124`).
- `checkout-ticket` → finalize ticket, compute value, update `daily_free_usage` (`src/main/index.ts:142-182`).
- `calculate-value` → preview value without committing (`src/main/index.ts:184-214`).
- `check-plate-was-in-today` (`src/main/index.ts:216-224`).
- `check-plate-subscription` (`src/main/index.ts:226-264`).
- `exclude-ticket` (password-gated, `src/main/index.ts:532-546`).
- `exclude-all-active-tickets` (password-gated, `src/main/index.ts:548-562`).
- `get-excluded-tickets` (`src/main/index.ts:564-571`).

**Clients / Subscriptions:**
- `create-client` (`src/main/index.ts:266-289`).
- `get-clients` (`src/main/index.ts:291-298`).
- `update-client` (`src/main/index.ts:300-324`).
- `toggle-client-status` (`src/main/index.ts:326-337`).
- `delete-client` (password-gated, `src/main/index.ts:510-531`).
- `renew-subscription` (`src/main/index.ts:339-367`).
- `get-client-statement` (`src/main/index.ts:390-397`).

**Financial / Reporting:**
- `get-financial-history` (`src/main/index.ts:369-376`).
- `get-financial-summary-by-method` (`src/main/index.ts:378-388`).
- `export-financial-csv` (`src/main/index.ts:399-439`).
- `get-history`, `get-history-for-day`, `get-history-last24h` (`src/main/index.ts:441-466`).
- `get-daily-report`, `save-daily-report` (`src/main/index.ts:468-504`).
- `export-daily-report-pdf` (`src/main/index.ts:655-735`).

**Printer:**
- `get-printers` (`src/main/index.ts:573-586`).
- `get-printer-config`, `save-printer-config` (`src/main/index.ts:588-595`).
- `print-entry`, `print-exit`, `print-subscription` (`src/main/index.ts:597-653`).

**Misc:**
- `ping` → no-op listener that logs `pong` (`src/main/index.ts:91`).

---

*Integration audit: 2026-05-09*
