# Technology Stack

**Analysis Date:** 2026-05-09

## Languages

**Primary:**
- TypeScript ~5.9.3 - Used in main process (`src/main/**`), preload (`src/preload/**`), renderer (`src/renderer/src/**`), tests (`__tests__/unit/*.test.ts`), and build configs (`electron.vite.config.ts`, `vitest.config.ts`)
- TSX (TypeScript + JSX) - React components in `src/renderer/src/**/*.tsx`

**Secondary:**
- JavaScript (ESM) - Tooling configs only: `eslint.config.mjs`, `tailwind.config.js`, `postcss.config.js`
- HTML - Renderer entry `src/renderer/index.html` and inline PDF report template in `src/main/index.ts`
- CSS - Tailwind-driven styles loaded from `src/renderer/src/assets/main.css`
- YAML - Build/update config: `electron-builder.yml`, `dev-app-update.yml`
- SQL - Inline DDL/DML strings in `src/main/db.ts`

## Runtime

**Environment:**
- Electron ^39.2.6 - Desktop runtime (Chromium renderer + Node.js main process). Configured via `electron.vite.config.ts`.
- Node.js (bundled with Electron 39; @types/node ^22.19.1 in devDependencies indicates Node 22 compatibility for the toolchain)
- Chromium (renderer) - HTML/CSS/JS view layer with strict CSP (`src/renderer/index.html` line 7-10)

**Package Manager:**
- npm (lockfile `package-lock.json` present at repo root)
- Lockfile: present (`package-lock.json`)

## Frameworks

**Core:**
- Electron ^39.2.6 - Cross-platform desktop shell. Main process entry: `src/main/index.ts`. Preload: `src/preload/index.ts`. Renderer: `src/renderer/src/main.tsx`.
- React ^19.2.1 + react-dom ^19.2.1 - Renderer UI library. Mounted in `src/renderer/src/main.tsx` with `StrictMode`.
- electron-vite ^5.0.0 - Multi-target (main/preload/renderer) Vite-based dev/build orchestrator. Config: `electron.vite.config.ts`.
- Vite ^7.2.6 + @vitejs/plugin-react ^5.1.1 - Dev server and bundler for the renderer.
- Tailwind CSS ^3.4.17 + autoprefixer ^10.4.24 + postcss ^8.5.6 - Styling. Configs: `tailwind.config.js`, `postcss.config.js`. Content scanned: `./index.html` and `./src/renderer/**/*.{js,ts,jsx,tsx}`.

**Testing:**
- Vitest ^3.2.4 - Test runner. Config: `vitest.config.ts` (Node environment, includes `__tests__/**/*.test.ts`).
- @vitest/coverage via v8 provider - Coverage focused on `src/main/calculations.ts`.

**Build/Dev:**
- electron-builder ^26.0.12 - Packaging/installer generation. Config: `electron-builder.yml` (NSIS installer for Windows, AppImage/snap/deb for Linux, DMG for Mac).
- TypeScript ^5.9.3 - Two compose-only project refs: `tsconfig.node.json` (main + preload), `tsconfig.web.json` (renderer + preload `.d.ts`).
- ESLint ^9.39.1 with `@electron-toolkit/eslint-config-ts`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-config-prettier`. Flat config: `eslint.config.mjs`.
- Prettier ^3.7.4 - Formatter (no `.prettierrc` checked in; defaults via `@electron-toolkit/eslint-config-prettier`).

## Key Dependencies

**Critical:**
- better-sqlite3 ^12.6.2 - Synchronous SQLite client used in main process. Imported in `src/main/db.ts`. Listed as `external` in `electron.vite.config.ts` (line 9) so the native module is required at runtime, not bundled.
- electron-pos-printer ^1.3.8 - Thermal POS printer driver for receipts. Used in `src/main/printer.ts`. Targets 80mm thermal printers (~302px width, see `WIDTH_80MM_PX` in `src/main/printer.ts:69`).
- electron-updater ^6.3.9 - Auto-update client. Listed in `package.json` and configured via `dev-app-update.yml` and `electron-builder.yml` `publish` block, but **not currently imported anywhere in `src/`** (no `autoUpdater` initialization found).
- date-fns ^4.1.0 - Date formatting and arithmetic. Used in `src/main/printer.ts`, `src/renderer/src/App.tsx` (functions: `format`, `differenceInMinutes`, `startOfMonth`, `endOfMonth`, `isWithinInterval`).

**Infrastructure:**
- @electron-toolkit/utils ^4.0.0 - `electronApp`, `optimizer`, `is.dev` helpers. Used in `src/main/index.ts`.
- @electron-toolkit/preload ^3.0.2 - `electronAPI` exposed via `contextBridge`. Used in `src/preload/index.ts`.
- @electron-toolkit/tsconfig ^2.0.0 - Base TypeScript configs extended by `tsconfig.node.json` and `tsconfig.web.json`.
- @electron-toolkit/eslint-config-ts ^3.1.0 + @electron-toolkit/eslint-config-prettier ^3.0.0 - Shared ESLint rules.
- clsx ^2.1.1 + tailwind-merge ^3.4.0 - Conditional + de-duplicated Tailwind class composition (used in renderer components, e.g. `src/renderer/src/App.tsx`, `src/renderer/src/components/ModalCheckout.tsx`, `src/renderer/src/components/AlertModal.tsx`).

**React Type Definitions:**
- @types/react ^19.2.7, @types/react-dom ^19.2.3, @types/node ^22.19.1.

## Configuration

**Environment:**
- No `.env` files in repo. App configuration is local-only.
- Runtime app config persisted to JSON file: `<userData>/config.json` via `src/main/config.ts`. Currently stores `{ printerName?: string }`.
- `process.env.NODE_ENV === 'development'` switches the SQLite DB path between `process.cwd()/parking.db` and `<userData>/parking.db` (`src/main/db.ts:6-9`).
- `process.env.DEBUG_PRINT === '1'` toggles the POS printer preview mode (`src/main/printer.ts:62`).
- `process.env.ELECTRON_RENDERER_URL` is read in dev to load the Vite dev server URL (`src/main/index.ts:69-73`).

**Build:**
- `electron.vite.config.ts` - main/preload/renderer build entry; marks `better-sqlite3` as a Rollup external; aliases `@renderer` → `src/renderer/src`.
- `electron-builder.yml` - app id `com.kf.estacionamento`, productName `KF Estacionamento`, NSIS Windows installer, output dir `dist/`, asarUnpack `resources/**`, extraResources include `build/icon.ico` and `resources/logo.png`.
- `tsconfig.json` - Project references only; delegates to `tsconfig.node.json` and `tsconfig.web.json`.
- `tsconfig.node.json` - Extends `@electron-toolkit/tsconfig/tsconfig.node.json`; includes `electron.vite.config.*`, `src/main/**/*`, `src/preload/**/*`. Composite build, types `electron-vite/node`.
- `tsconfig.web.json` - Extends `@electron-toolkit/tsconfig/tsconfig.web.json`; includes `src/renderer/src/**/*`, `src/preload/*.d.ts`. JSX `react-jsx`, paths alias `@renderer/*` → `src/renderer/src/*`.
- `vitest.config.ts` - Node test environment; coverage target restricted to `src/main/calculations.ts`; alias `@` → `src`.
- `tailwind.config.js` - Content globs `./index.html` and `./src/renderer/**/*.{js,ts,jsx,tsx}`; default theme.
- `postcss.config.js` - Plugins: `tailwindcss`, `autoprefixer`.
- `eslint.config.mjs` - Flat config combining TS + React + Prettier presets; ignores `node_modules`, `dist`, `out`.
- `dev-app-update.yml` - electron-updater dev config (provider `generic`, placeholder URL `https://example.com/auto-updates`).

## Platform Requirements

**Development:**
- Windows (primary, per build scripts and `signAndEditExecutable: false` workaround in `electron-builder.yml`). Mac/Linux dev paths exist but are not the main target.
- npm + Node toolchain compatible with Electron 39 (npm scripts run `electron-vite dev`, `electron-vite build`, `electron-builder install-app-deps` postinstall).
- `electron-builder install-app-deps` rebuilds `better-sqlite3` against the current Electron ABI (`postinstall` hook).
- `electronDownload.mirror: https://npmmirror.com/mirrors/electron/` configured for faster Electron binary downloads.

**Production:**
- Windows desktop (primary): NSIS installer `${name}-${version}-setup.${ext}` produced by `npm run dist:installer` / `npm run build:win`. Code signing disabled (`signAndEditExecutable: false`).
- macOS: DMG via `npm run build:mac` (notarize disabled; entitlements file `build/entitlements.mac.plist` referenced but not committed).
- Linux: AppImage, snap, deb via `npm run build:linux`.
- Local SQLite database stored under `app.getPath('userData')/parking.db`.
- Local config at `app.getPath('userData')/config.json`.
- Chromium browser cache redirected to `<userData>/browser-cache` to avoid OneDrive/sync conflicts (`src/main/index.ts:9-21`).

---

*Stack analysis: 2026-05-09*
