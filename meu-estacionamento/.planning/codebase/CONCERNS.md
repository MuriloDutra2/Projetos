# Codebase Concerns

**Analysis Date:** 2026-05-09

> Focus: Electron-specific security risks, the checked-in `parking.db` (which **contains real customer data**), hardcoded passwords, fragile main-process patterns, brittle UI/state coupling, and bundling/auto-update gaps. Severity tags: **Critical / High / Medium / Low**.

---

## Tech Debt

**Hardcoded admin passwords in main process source (Critical):**
- Issue: Three operational passwords are written as plain string literals inside the main process and shipped with every build.
- Files: `src/main/index.ts:506-508`
  ```ts
  const EXCLUDE_TICKET_PASSWORD = 'Kefit2026'
  const DELETE_CLIENT_PASSWORD = 'Kefit2026'
  const EXCLUDE_ALL_PASSWORD  = 'murilo123@'
  ```
- Impact:
  - Anyone with the installer can extract `app.asar`, read these strings, and unconditionally clear the lot (`exclude-all-active-tickets`), wipe clients (`delete-client`), or void any active ticket (`exclude-ticket`).
  - Same value (`Kefit2026`) is reused for two different "destructive" actions — rotating one is impossible without rotating the other.
  - Comparison is a literal `!==`, so leaked passwords cannot be revoked without an app rebuild + redeploy.
- Fix approach:
  1. Move these to per-install config (`config.json` in `app.getPath('userData')`) seeded by the operator on first run.
  2. Store as PBKDF2/Argon2 hash + salt, not cleartext.
  3. Add a per-attempt rate limit / lockout (none today — brute-forcing the 4-digit habit is trivial).
  4. Until rotated, treat current passwords as compromised because they live in git history (`23c67ee`, `4b458cc`).

**`parking.db` checked into git with real production data (Critical):**
- Issue: A 45 KB SQLite file (`SQLite format 3` magic verified) sits at repo root and is tracked.
- Files: `parking.db` (`git ls-files | grep parking.db` confirms tracking), schema in `src/main/db.ts:20-94`.
- Confirmed real data inside the binary:
  - Plates: `LYO1234`, `MUR1234`, `HJB-1235`, `KLF1234`, `ABC1234`, etc. (mix of test + plausibly real plates).
  - Clients: `Murilo Dutra` with `MENSAL_CARRO` plan, expiry `2026-04-01`.
  - CPF-shaped strings: `12345678989`, `11234556521`; phone `11993864919` (matches BR cell format `11 9XXXX-XXXX`).
  - Payment history with `Pix` method and `MENSAL_CARRO` competency rows.
- Impact:
  - LGPD / privacy violation: nominal CPF + phone + name + vehicle plates persisted in any clone of the repo, including anyone who later forks or downloads the bundle.
  - Even if the file is removed from `HEAD`, prior commits keep the data forever — already present across all four commits in the log.
  - The runtime path differs (`src/main/db.ts:6-9` uses `app.getPath('userData')` in production, `process.cwd()/parking.db` in dev), so the committed DB is *only* used in dev. Yet it still leaks PII.
- Fix approach:
  1. Immediately purge: `git filter-repo --invert-paths --path parking.db`, force-push, rotate hardcoded passwords (see above), and notify any data subjects whose CPF/name leaked.
  2. Add `parking.db` (and `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm`) to `.gitignore`.
  3. Provide a `seed-dev.ts` script that recreates an empty schema, so devs do not need a checked-in DB.

**Plain-text password fields use `maxLength={10}` (Medium):**
- Issue: Renderer password inputs cap at 10 chars, encouraging short admin passwords.
- Files: `src/renderer/src/components/ModalCheckout.tsx:109`, `src/renderer/src/App.tsx:1593` (excluir todos), `src/renderer/src/App.tsx:1657` (delete client).
- Impact: Aligns the UI to weak credentials; a 10-char ceiling is hostile to passphrase managers.
- Fix approach: Drop `maxLength` (or set to 128) once the back-end stores hashes.

**Auto-updater configured against a placeholder URL (High):**
- Issue: `dev-app-update.yml` and `electron-builder.yml` both use `https://example.com/auto-updates`.
- Files: `dev-app-update.yml:1-3`, `electron-builder.yml:54-56`.
- Impact:
  - If `electron-updater` is ever wired up at runtime, it would poll a placeholder host. If a malicious actor registers `example.com/auto-updates` (or an internal proxy intercepts it), they can ship arbitrary signed-by-them payloads.
  - `package.json:34` lists `electron-updater@^6.3.9` as a runtime dependency, but no source file actually invokes it (`grep autoUpdater src/` returns nothing). The dependency is dead weight while still pulled into the bundle.
  - `electron-builder.yml:26` sets `signAndEditExecutable: false` — installers are unsigned, so even a real update host has no signature trust anchor.
- Fix approach:
  1. Either remove `electron-updater` + `dev-app-update.yml` + the `publish:` block (offline-only kiosk app) **or** point `url:` at a real S3/HTTPS endpoint and set up code-signing.
  2. If kept, add `autoUpdater.checkForUpdatesAndNotify()` wiring inside `app.whenReady()` and verify code signing.

**Custom IPC API exposed via `window.api` re-implements `electron.ipcRenderer` (Medium):**
- Issue: `src/preload/index.ts:101` exposes the custom `api` object, but `src/preload/index.ts:100` *also* exposes the full `@electron-toolkit/preload` `electronAPI` (which gives the renderer `ipcRenderer.invoke(...)` against any channel).
- Files: `src/preload/index.ts:96-110`, used at `src/renderer/src/App.tsx:346` (`window.electron.ipcRenderer.invoke('print-exit', ...)`) and `:440` (`'print-entry'`).
- Impact:
  - The preload defines a typed allow-list (`api`) but bypasses it with the unrestricted `window.electron.ipcRenderer`. Any future XSS in the renderer can call *every* registered IPC channel.
  - Two ways to do the same call (`window.api.printSubscription` vs `window.electron.ipcRenderer.invoke('print-…')`) drift over time; only `printSubscription` is in the allow-list — `print-entry` and `print-exit` go through the raw bridge.
- Fix approach:
  1. Add `printEntry` / `printExit` to `api` and the `.d.ts`, replace `window.electron.ipcRenderer.invoke` calls in the renderer.
  2. Stop exposing the bare `electronAPI` once nothing in the renderer needs it (or expose a curated subset).

---

## Known Bugs / Logic Risks

**Race condition between debtor check and ticket creation (High):**
- Symptoms: Two near-simultaneous entries for the same plate can both pass `hasActiveTicket` and create duplicate `ATIVO` tickets.
- Files: `src/main/index.ts:105-124` (`create-ticket` handler), `src/main/db.ts:120-125` (`getActiveByPlaca` + `createTicket`).
- Trigger: Operator double-clicks "ENTRADA" or barcode scanner fires twice. The check + insert are not in a transaction and `tickets.placa` has no UNIQUE index for `status='ATIVO'`.
- Workaround: Renderer disables the form via `setLoading(true)` (`src/renderer/src/App.tsx:466`), but only on the same window. A second instance or a fast double-fire bypasses it.
- Fix: Wrap the check-and-insert in `db.transaction(...)` (already imported elsewhere) **and** add a partial unique index `CREATE UNIQUE INDEX … ON tickets(placa) WHERE status='ATIVO'`.

**Foreign keys disabled while deleting clients (Medium):**
- Symptoms: `deleteClientRecord` runs `db.pragma('foreign_keys = OFF')` and back ON afterwards (`src/main/db.ts:672-679`). If anything between the two `pragma` calls throws (the `try/finally` is correct here, good), but in the window where FKs are off any other concurrent IPC handler operates without referential integrity.
- Files: `src/main/db.ts:668-680`.
- Trigger: Concurrent `create-ticket` while the operator is deleting a client.
- Impact: `client_vehicles` rows pointing at a deleted `clients.id`, plus `subscription_payments` rows whose `client_id` no longer exists (the latter is intentional via `payer_display_name`, but any *new* payment racing the delete becomes orphaned).
- Fix: Use `ON DELETE` cascade rules in the schema instead of toggling the pragma, or wrap the delete in a single immediate transaction with `BEGIN IMMEDIATE`.

**Schema migrations are ad-hoc `ensureColumn` calls (Medium):**
- Symptoms: Columns are added on every startup via `ALTER TABLE … ADD COLUMN` (`src/main/db.ts:75-82`). There is no version table, no rollback, and no ordering guarantee for renames or backfills.
- Files: `src/main/db.ts:13-18` (`ensureColumn`), 75-82.
- Impact: Future column renames or data migrations will need a real migration framework; the current pattern only supports "add nullable column".
- Fix: Adopt a tiny migrations table (`PRAGMA user_version` + a numbered `migrations/*.sql` folder).

**`getHistory` arbitrary 50-row limit, `getFinancialHistory` 200, `getAllFinishedForFinance` 200 (Low):**
- Symptoms: Once the lot has more than ~6 months of throughput the financial summary silently truncates.
- Files: `src/main/db.ts:101`, `:118`, `:194`.
- Impact: Reports look "complete" but miss older payments, leading to silent under-reporting in `mixedTransactionsAll` (`src/renderer/src/App.tsx:404-419`).
- Fix: Drive limits from the UI filter (month/year already selected on screen) instead of hard-coding.

**`useEffect` dependency array missing `loadHistory` / `loadFinancialHistory` / `loadClients` (Low):**
- Symptoms: ESLint react-hooks rule would flag these; they are stable closures today but any future capture of state will go stale.
- Files: `src/renderer/src/App.tsx:183-209`.
- Fix: Wrap loaders in `useCallback` with proper deps and include them.

**Polling re-render hack (Low):**
- Symptoms: `setInterval(() => setTickets((p) => [...p]), 60000)` (`src/renderer/src/App.tsx:212`) clones the ticket array every 60 s purely to recompute `calcularTempoDecorrido`. Wastes a render even when no tickets are open.
- Fix: Bind the timer to a `useState(Date.now())` "tick" value and consume it inside the time-formatting helper.

---

## Security Considerations (Electron-specific)

**`webPreferences` are partially insecure (High):**
- File: `src/main/index.ts:45-56`.
  ```ts
  webPreferences: {
    preload: path.join(__dirname, '../preload/index.js'),
    sandbox: false
  }
  ```
- Risk: `sandbox: false` disables the OS-level renderer sandbox. `contextIsolation` and `nodeIntegration` are not set explicitly — they fall back to Electron 39 defaults (`contextIsolation: true`, `nodeIntegration: false`), which is fine, but **relying on defaults is fragile** across Electron upgrades.
- Current mitigation: Renderer ships a CSP (`src/renderer/index.html:7-10` — `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`) and the preload uses `contextBridge.exposeInMainWorld` (`src/preload/index.ts:100-101`).
- Recommendations:
  1. Set `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (the current `sandbox: false` exists because `@electron-toolkit/preload` uses `require`; a sandbox-compatible preload is a small refactor).
  2. Add `webContents.on('will-navigate', e => e.preventDefault())` and `webContents.setWindowOpenHandler` (already done at `src/main/index.ts:63-66`, good — but keep it in a centralized hardening helper).
  3. Wire `session.defaultSession.setPermissionRequestHandler(...)` to deny camera, mic, geolocation, notifications by default (currently unhandled — verified via grep, no matches in `src/`).

**Second `BrowserWindow` for PDF export uses only `nodeIntegration: false` (Medium):**
- File: `src/main/index.ts:703-708` (`export-daily-report-pdf`).
  ```ts
  const win = new BrowserWindow({ width: 800, height: 600, show: false,
    webPreferences: { nodeIntegration: false } })
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  ```
- Risk: `contextIsolation` and `sandbox` are unset; the page is loaded from a `data:` URL with HTML built by string concatenation. Although the inputs are server-side numbers/dates today, any future free-form text field rendered into that HTML becomes an injection sink.
- Fix: Add `contextIsolation: true, sandbox: true, webSecurity: true`, and use templating that HTML-escapes. Even better — render to PDF from the *main* window via `webContents.printToPDF` against a dedicated route.

**No `permission-request-handler`, `will-attach-webview`, `web-contents-created` global hardening (Medium):**
- Files: searched `src/main/` — no matches for `setPermissionRequestHandler`, `will-navigate`, `web-contents-created`.
- Risk: A future feature that opens any web content (help page, OAuth) can navigate or pop new windows without restriction.
- Fix: In `app.whenReady()`, add a global `app.on('web-contents-created', (_, wc) => { wc.on('will-navigate', …); wc.setWindowOpenHandler(…) })`.

**IPC handlers do not validate types beyond TypeScript (Medium):**
- Files: every `ipcMain.handle` in `src/main/index.ts:94-735`.
- Risk: TypeScript types are erased at runtime. A renderer compromised by XSS (or a renderer talking through `window.electron.ipcRenderer`) can pass `{ id: { toString: () => "1; DROP TABLE …" } }` or arbitrary nested structures. `better-sqlite3`'s prepared statements protect against SQL injection — but not against prototype pollution, ReDoS in `normalizePlate`, or huge payloads (`get-clients` blindly returns whatever).
- Current mitigation: `normalizePlate` strips non-alphanumerics (`src/main/index.ts:103`); SQL is fully parameterized through `db.prepare(...)` (verified — only `PRAGMA table_info(${table})` and `ALTER TABLE` use template literals, both with hard-coded constants in `ensureColumn` calls at `src/main/db.ts:14,16`).
- Recommendations:
  1. Add a runtime validator (zod / valibot) per handler.
  2. Cap `password` and `notes` lengths at the IPC boundary.
  3. Reject any `placa` longer than 8 chars (the renderer already does, but the main process must too).

**No SQL injection vectors found (informational):**
- Verified: every dynamic value flows through `?` placeholders (`src/main/db.ts:96-273`). The only string-concatenation SQL is in `ensureColumn` (`PRAGMA table_info(${table})`, `ALTER TABLE ${table} ADD COLUMN ${ddl}`), but `table`/`ddl` are hard-coded constants from inside the same file. Safe **today** — but document the invariant so a future contributor doesn't pass user input there.

**Plate look-ups use `UPPER(REPLACE(placa,'-',''))` (Low):**
- File: `src/main/db.ts:139-144` (`getPlateWasInToday`).
- Risk: Function call on every row prevents index use. With a few thousand tickets the table scan is still instant; with 100k+ it will start to bite.
- Fix: Store plates already normalized (which the writers already do via `normalizePlate`) and drop the SQL-side normalization.

---

## Performance Bottlenecks

**`getClients` does N+1 round trips per row (Medium):**
- Problem: For each client, two extra prepared-statement calls (`getLatestPaymentByClientId`, `hasPaymentInMonth` × 2 inside `isMensalistaDebtor`/`isGaragemDebtorInternal`) — see `src/main/db.ts:397-443`.
- Cause: Per-row enrichment in JS instead of a single SQL aggregate.
- Improvement: One CTE-based SELECT joining `clients`, latest payment, current-competency-paid flag.

**Renderer recomputes `mixedTransactionsAll` on every render (Low):**
- Files: `src/renderer/src/App.tsx:404-419`.
- Cause: No memoization (`useMemo`) around the merge-and-sort. Cheap today, scales linearly with `history.length + financialHistory.length`.
- Fix: Wrap in `useMemo`.

**`tickets` array cloned every 60 seconds purely to trigger re-render (Low):**
- See "Polling re-render hack" above.

**Auto-imported barcode scanner buffer (Low):**
- File: `src/renderer/src/hooks/useBarcodeScanner.ts:41-93`.
- Risk: A user typing fast (>33 chars/s, e.g., paste-to-input) can trigger a false positive `onScan`. The 150 ms burst window catches most cases but is heuristic.
- Fix: Tighten by also requiring scanner suffix (Enter) when an input is focused.

---

## Fragile Areas

**`src/renderer/src/App.tsx` is a 1839-line god component (High):**
- Files: `src/renderer/src/App.tsx` (1839 lines, all 7 views — inicio, historico, relatorio, mensalistas, financeiro, excluidos, configuracoes — plus 4 modals' state).
- Why fragile:
  - Every view, every modal, every search filter, every keyboard shortcut, every effect, and every API call lives in one closure. Adding a new view or refactoring "filtered tickets" risks side-effects across other views.
  - State is one giant flat list (35+ `useState` calls); navigating which `setX` resets which related field is folklore.
  - The shortcut effect at `:216-242` depends on **8 state variables**; a missing dep here silently breaks Esc/Ctrl+N.
- Safe modification:
  1. Touch one `useState` cluster at a time.
  2. Prefer adding a new sibling component instead of inlining JSX.
- Test coverage: only `__tests__/unit/calculations.test.ts` and `__tests__/unit/garageDates.test.ts` (~2 test files); no React component tests, no integration tests against the main process. `__tests__/README.md:58` explicitly notes the integration tests do not run because `db` depends on Electron.
- Refactor target: split per view (`views/Inicio.tsx`, `views/Mensalistas.tsx`, …), extract modals' state into reducers.

**`config.ts` swallows read/write errors (Medium):**
- Files: `src/main/config.ts:13-34`.
- Why fragile: A corrupted `config.json` returns defaults silently. The user keeps seeing "no printer configured" with no clue. Same for write failures (disk full, OneDrive sync lock).
- Fix: Surface `getConfig`/`saveConfig` errors back to the renderer and show a toast.

**`printer.ts` resolves logo via 5-path probe (Medium):**
- Files: `src/main/printer.ts:11-25`.
- Why fragile: Five candidate paths combine `process.cwd()`, `app.getAppPath()`, `app.asar.unpacked`, and `process.resourcesPath`. When `electron-builder.yml:14-21` changes (e.g., `extraResources` is renamed), the order matters and silently falls back to "no logo".
- Fix: Pin one canonical path; throw if missing in production.

**`runPrint` 30 s timeout vs `electron-pos-printer` synchronous spooler (Medium):**
- Files: `src/main/printer.ts:99-122`.
- Why fragile: The timeout race rejects after 30 s, but the underlying spooler call may continue running, holding a printer lock. A retry then fights the orphaned job.
- Fix: After timeout, call `PosPrinter.cancel()` (if available) or document that the operator must clear the queue.

**`is.dev` vs production DB path (Medium):**
- Files: `src/main/db.ts:6-9`.
- Why fragile: `process.env.NODE_ENV === 'development'` selects `process.cwd()/parking.db`. `electron-vite dev` sets `NODE_ENV=development`, so dev devs hit a *different* file from the packaged app — the committed `parking.db`. This is the same DB whose PII is checked in.
- Fix: Always use `app.getPath('userData')`, even in dev (devs can manually copy a seed DB if needed).

**`ensureColumn` runs on every cold start (Low):**
- Files: `src/main/db.ts:75-82`.
- Why fragile: Each launch issues `PRAGMA table_info` per ensured column; cheap today, but the list will grow.
- Fix: Real migrations (see Tech Debt section).

---

## Bundling & Distribution

**Installer artifact (`dist/meu-estacionamento-1.0.0-setup.exe`, ~103 MB) is local but not git-tracked (informational):**
- Verified via `git ls-files | grep -E "(dist/|out/|\.exe)"` — only `parking.db` is tracked. `dist/`, `out/`, `node_modules/` are correctly in `.gitignore`.
- However, `.gitignore` is *only* 8 lines and **does not** ignore: `*.db`, `*.db-journal`, `*.db-wal`, `*.db-shm`, `parking.db`, `coverage/`, `.eslintcache`, `test-results.json`. The 1.1 MB `.eslintcache` and 7.7 KB `test-results.json` exist on disk but are not tracked yet — first time they accidentally `git add .`'d they would commit.
- Fix: Extend `.gitignore`:
  ```
  *.db
  *.db-journal
  *.db-wal
  *.db-shm
  .eslintcache
  test-results.json
  coverage/
  ```

**`electron-builder.yml` excludes `dev-app-update.yml` from the bundle (Low):**
- Files: `electron-builder.yml:8-13`.
- Why fragile: Good for production, but means `electron-updater` running in dev will not pick up update metadata. Combined with the placeholder URL, the auto-update path is effectively dead.
- Fix: Either remove the dependency or wire it up properly (see auto-update entry above).

**Installers are unsigned (`signAndEditExecutable: false`) (Medium):**
- Files: `electron-builder.yml:25-26`.
- Risk: Windows SmartScreen will flag the installer; users learn to "click through" the warning, defeating future code-signing. Also blocks any meaningful auto-update verification.
- Fix: Acquire an EV / OV code-signing cert; remove `signAndEditExecutable: false`.

**`electronDownload.mirror: https://npmmirror.com/...` (Low):**
- Files: `electron-builder.yml:57-58`.
- Risk: Build-time dependency on a third-party Chinese mirror for the Electron binary. If that mirror is compromised, a poisoned Electron binary lands inside every signed installer.
- Fix: Use the default GitHub mirror unless there's a specific bandwidth need. If kept, pin a SHA in `package.json` or pre-cache the binary.

---

## Scaling Limits

**Single SQLite file, single process (informational):**
- Current capacity: Designed for one parking lot, one operator workstation. `better-sqlite3` is synchronous; every IPC call blocks the main thread until SQL returns.
- Limit: Two operators on different PCs cannot share the same DB safely without an external sync layer.
- Scaling path: If multi-operator support is needed, move the data layer to a network DB (Postgres) or run a small local HTTP service on one PC and have the others connect.

**Hardcoded LIMIT clauses (informational):**
- See "Known Bugs" — `LIMIT 50/200/500` in `src/main/db.ts:101,118,195,236`. After 12-18 months these caps silently truncate financial/history views.

---

## Dependencies at Risk

**`electron-pos-printer@^1.3.8` (Medium):**
- Files: `package.json:33`.
- Risk: The library is community-maintained and lags behind Electron major versions. Combined with the printing fragility (5-path logo probe, 30 s timeout race, "TimedOutError" string match in `friendlyError` at `src/renderer/src/utils/errorHandler.ts:15`), a major Electron upgrade can break printing without compile-time signal.
- Migration plan: If it stops shipping updates, fall back to `webContents.print()` plus a custom thermal-printer-friendly stylesheet.

**`electron-updater@^6.3.9` (Low):**
- Files: `package.json:34`.
- Risk: Listed but unused (verified — no source imports). Carries CVE surface area for nothing.
- Migration plan: Remove unless auto-update is actually being implemented.

**`better-sqlite3@^12.6.2` native bindings (Low):**
- Files: `package.json:30`.
- Risk: Native module — every Electron upgrade requires `electron-builder install-app-deps` (`postinstall` script in `package.json:19`, good). But local Node 24 vs Electron's bundled Node version mismatch already breaks running scripts directly (`node -e "..."` against `parking.db` failed during this audit with `NODE_MODULE_VERSION 140 vs 137`).
- Mitigation: Document a `npm run db:inspect` script that runs through Electron's Node, not the system Node.

---

## Missing Critical Features

**No backup / export beyond CSV (High):**
- Problem: The whole business state is one SQLite file in `%APPDATA%\KF Estacionamento\parking.db`. There is no scheduled backup, no "export DB" button, no off-site sync.
- Files: `src/main/index.ts:399-439` only exports a flat CSV of finished tickets and renewals.
- Blocks: Disaster recovery. A dead disk means the operator loses all subscription / payment / ticket history.
- Fix: Add a "Backup" action that copies the SQLite file (plus `-wal`/`-shm` if present) to a user-chosen folder, or schedules a daily copy to OneDrive.

**No audit log (High):**
- Problem: When `exclude-all-active-tickets` runs, it overwrites every `ATIVO` row with `EXCLUIDO`. There is **no record** of *who* (operator) or *when* (beyond the bulk timestamp) the action happened, only the password used.
- Files: `src/main/index.ts:548-562`, `src/main/db.ts:132-134`.
- Blocks: Forensics on suspicious mass-exclusions, dispute resolution with operators.
- Fix: Add an `audit_log` table (`id, action, actor, timestamp, details_json`), and write to it from every destructive IPC handler.

**No application updates without rebuild (Medium):**
- Problem: Auto-updater is a placeholder; deploying a fix means re-installing on every machine via USB stick (per `TESTES-ANTES-DO-PENDRIVE.md`).
- Fix: Wire `electron-updater` against a real publish target (S3 + signed releases).

**No multi-language support (Low):**
- All strings are inline pt-BR throughout `src/renderer/src/App.tsx`. A migration to `react-i18next` or similar will be a sprawling diff later.

---

## Test Coverage Gaps

**Main process / IPC handlers untested (High):**
- What's not tested: Every `ipcMain.handle` in `src/main/index.ts:91-735`, all of `dbOperations` in `src/main/db.ts`, all of `printer.ts`, `config.ts`.
- Files: `__tests__/unit/calculations.test.ts`, `__tests__/unit/garageDates.test.ts` only.
- Risk: Changes to fee calculation, debtor logic, schema migrations, password gates, etc. can ship without a single failing test.
- Priority: High.
- Fix path: `__tests__/README.md:58` already calls this out — needs a test helper that opens `better-sqlite3` against `:memory:` and runs the schema/migrations independently of Electron.

**No React component tests (High):**
- What's not tested: Any of the 1839 lines of `src/renderer/src/App.tsx` plus the four modal components (`ModalCheckout`, `ModalNovoCliente`, `ModalRenovar`, `AlertModal`).
- Risk: UI-state regressions only surface during the manual `TESTES-ANTES-DO-PENDRIVE.md` checklist.
- Priority: High.
- Fix path: Add `@testing-library/react` + `vitest` JSDOM environment, start with the modal flows that handle passwords (most security-sensitive).

**No end-to-end / Spectron / Playwright coverage (Medium):**
- What's not tested: Full app launch + IPC roundtrip + DB.
- Risk: Build-time regressions in preload exposure, IPC contract drift, or `webPreferences` defaults change between Electron majors.
- Priority: Medium.
- Fix path: Add `playwright-electron` smoke test that launches the app and asserts `window.api` has the expected keys.

**Printer code path is mocked at zero levels (Medium):**
- What's not tested: `runPrint` timeout race, `getLogoPath` fallback chain, two-via subscription receipt content.
- Risk: A subtle change to `getBaseOptions` (page size in pixels vs string `'80mm'`) silently broke prior versions; the comments at `src/main/printer.ts:67-95` warn about the trap.
- Priority: Medium.
- Fix path: Pure-function tests over `buildSubscriptionReceiptContent` (already pure, just not invoked from tests).

---

*Concerns audit: 2026-05-09*
