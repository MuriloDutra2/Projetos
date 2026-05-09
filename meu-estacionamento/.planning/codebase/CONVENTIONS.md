# Coding Conventions

**Analysis Date:** 2026-05-09

## Toolchain Overview

- **Linter:** ESLint 9 (flat config) at `eslint.config.mjs`, extending `@electron-toolkit/eslint-config-ts` (recommended TypeScript rules) plus `eslint-plugin-react`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh` (vite preset). `@electron-toolkit/eslint-config-prettier` is applied last to disable formatting rules that conflict with Prettier.
- **Formatter:** Prettier 3 configured via `.prettierrc.yaml` with project-wide overrides (no `.editorconfig` conflicts: `.editorconfig` enforces UTF-8, LF, 2-space indent).
- **Languages:** TypeScript (strict React 19, Electron 39 split between `src/main`, `src/preload`, `src/renderer/src`).
- **Run commands** (from `package.json`):
  - `npm run lint` (ESLint with cache)
  - `npm run format` (Prettier write)
  - `npm run typecheck` (`tsc --noEmit` for both `tsconfig.node.json` and `tsconfig.web.json`)

There is **no `lint-staged`, `husky`, or pre-commit hook** wired in; lint and typecheck are manual.

## Prettier Settings (`.prettierrc.yaml`)

```yaml
singleQuote: true
semi: false
printWidth: 100
trailingComma: none
```

Implications enforced across the codebase:
- Single quotes for strings (`import { app } from 'electron'` in `src/main/index.ts`).
- **No semicolons** at statement ends (see `src/main/calculations.ts`, `src/renderer/src/utils/masks.ts`, every component).
- Lines wrap at 100 columns.
- No trailing commas on the last property/array element.

`.prettierignore` excludes: `out`, `dist`, `pnpm-lock.yaml`, `LICENSE.md`, `tsconfig.json`, `tsconfig.*.json`.

## EditorConfig (`.editorconfig`)

```
charset = utf-8
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
```

Applies to all files. New files MUST use 2-space indents and LF line endings.

## ESLint Composition (`eslint.config.mjs`)

```js
export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  { settings: { react: { version: 'detect' } } },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  eslintConfigPrettier
)
```

Notes:
- No custom rule overrides — the project relies entirely on the toolkit recommended set.
- `out`, `dist`, and `node_modules` are ignored.
- `react/jsx-runtime` is enabled, so React does **not** need to be imported just for JSX.
- React Hooks recommended rules are active (`exhaustive-deps`, `rules-of-hooks`).

## Language

The product domain is Portuguese (Brazil). Identifiers, comments, JSDoc, log messages, and UI strings mix Portuguese and English freely. Treat this as the project standard — do not "translate" to English when adding code.

**Portuguese identifiers (preserve):**
- Functions: `calcularValor`, `isPernoite`, `minutosDaEstadia`, `splitStayIntoLocalDaySegments` in `src/main/calculations.ts`; `formatarTempo` in `src/renderer/src/components/ModalCheckout.tsx`.
- Variables: `entrada`, `saida`, `placa`, `tipo`, `valor`, `horasExtras`, `excludePassword`, `excludeError`.
- Constants: `MESES = ['Jan', 'Fev', ...]` in `src/renderer/src/App.tsx`.
- Domain terms preserved as-is: `pernoite` (overnight stay), `mensalista` (subscriber), `avulso` (walk-in), `pátio` (lot), `garagem`, `cobrança`.

**English identifiers (also common):**
- React props/types: `AlertModalProps`, `ModalCheckoutProps`, `Ticket`, `HistoryEntry`, `ClientRow`.
- Generic helpers: `maskPlate`, `plateToRaw`, `validatePlate`, `friendlyError`, `localDateKeyFromDate`, `effectiveBillingDayInMonth`.
- DB column names mix: `placa`, `tipo`, `entrada`, `saida`, `valor` (Portuguese) alongside `plan_type`, `expiry_date`, `payment_method`, `competency_month` (English).

**Comments and JSDoc:** Portuguese is the default. Examples:
```ts
/** Verifica se a estadia se qualifica como pernoite (18h às 08h). */
/** Chave YYYY-MM-DD do calendário local (ex.: Brasília no PC do estacionamento). */
/** Mantém só números. Limita a 11 chars. Formata 000.000.000-00 */
```

**UI strings:** All Portuguese. Error messages in `friendlyError` (`src/renderer/src/utils/errorHandler.ts`) and `translateDbError` (`src/main/db.ts`) return Portuguese only.

## Naming Patterns

**Files:**
- Main process modules: lowercase, single word: `calculations.ts`, `config.ts`, `db.ts`, `printer.ts`, `index.ts`, `garageDates.ts` (camelCase when multi-word).
- Renderer components: PascalCase + `.tsx`: `AlertModal.tsx`, `ModalCheckout.tsx`, `ModalNovoCliente.tsx`, `ModalRenovar.tsx`, `Versions.tsx`.
- Renderer utilities/hooks: camelCase: `masks.ts`, `errorHandler.ts`, `useBarcodeScanner.ts`.
- Test files: `*.test.ts` only (matched by Vitest `include`); located under `__tests__/unit/`.

**Functions / methods:** camelCase, mixing English (`createTicket`, `getClients`, `friendlyError`) and Portuguese (`calcularValor`, `formatarTempo`).

**Variables:** camelCase. Acronyms preserved in case (`dbOperations`, `dbPath`, `cpf`).

**Types & interfaces:** PascalCase (`AlertModalProps`, `AppConfig`, `GetDailyUsedForDate`, `ClientRow`). No `I`-prefix on interfaces.

**Constants:** UPPER_SNAKE_CASE only when truly constant module-level magic numbers, e.g. `BARCODE_IDLE_MS`, `BARCODE_BURST_MS`, `MIN_PLATE_LENGTH` in `src/renderer/src/hooks/useBarcodeScanner.ts`. Other module-level immutable arrays use camelCase or local convention (`const MESES = [...]`).

**SQL / DB columns:** snake_case (`plan_type`, `expiry_date`, `payment_method`, `is_advance`, `competency_month`, `payer_display_name`). When mapped into TS, the snake_case is usually kept (`row.plan_type`).

**Plate / status enums:** UPPERCASE string literals stored in DB: `'ATIVO'`, `'FINALIZADO'`, `'EXCLUIDO'`, `'MENSAL_CARRO'`, `'MENSAL_MOTO'`, `'FUNCIONARIO'`, `'GARAGEM'`. Compare with strict equality, never normalize.

## Module / Export Patterns

- Prefer **named exports** for functions and types (`export function calcularValor`, `export type GetDailyUsedForDate`). React components use **`export default`** (`export default function AlertModal`, `export default function ModalCheckout`).
- Re-exports are used to expose helpers from a sibling module: `export { effectiveBillingDayInMonth } from './garageDates'` in `src/main/db.ts`.
- DB layer collects prepared statements in a single object literal: `const stmts = { ... }` and exports `dbOperations` as the public API surface (see `src/main/db.ts:96` and `src/main/db.ts:313`).
- **No barrel files** (`index.ts` re-exporting a folder) anywhere in `src/`.
- Path alias `@` → `src` is registered in `vitest.config.ts`. Test files currently use **relative imports** instead (`../../src/main/calculations`); follow that pattern in new tests until the alias is wired in `tsconfig.web.json`/`tsconfig.node.json`.

## Import Organization

Observed order in source files (`src/main/index.ts`, `src/renderer/src/App.tsx`):
1. Node / Electron / 3rd-party packages (`electron`, `path`, `fs`, `react`, `date-fns`, `clsx`).
2. Project modules via relative paths (`./db`, `./calculations`, `./components/ModalCheckout`, `./utils/masks`).
3. Asset / type imports (`import icon from '../../resources/icon.png?asset'`, `import logoImg from './assets/logo.png'`).

There is no automatic sort plugin; groups are separated by intent rather than by blank lines.

## TypeScript Style

- Project is **strict** via the `@electron-toolkit/tsconfig` presets (`tsconfig.node.json`, `tsconfig.web.json`). Two composite projects covering `src/main` + `src/preload` (node) and `src/renderer/src` (web).
- Always **annotate function return types**, including `void` and `Promise<...>`. React components return `React.JSX.Element | null`:
  ```ts
  export default function AlertModal({ ... }: AlertModalProps): React.JSX.Element | null
  ```
- Prefer `interface` for object shapes used as props/rows (`interface AlertModalProps`, `interface Ticket`, `interface AppConfig`); use `type` for unions, function signatures, and aliases (`export type GetDailyUsedForDate = (dateKey: string) => number`).
- Use `unknown` (not `any`) for caught errors, and narrow before reading: see `friendlyError` in `src/renderer/src/utils/errorHandler.ts` and `translateDbError` in `src/main/db.ts:302`.
- Optional / nullable fields use `?:` plus `| null` only when the DB returns `null` explicitly (`lastPaymentDate?: string | null`).
- Inline IPC payload types are written directly in destructured handlers in `src/main/index.ts`:
  ```ts
  ipcMain.handle('create-ticket', (_event, { placa, tipo }: { placa: string; tipo: string }) => { ... })
  ```
- Re-use the typed `window.api` exposed from `src/preload/index.ts` instead of calling `ipcRenderer` directly from the renderer.

## React / JSX Style

- React 19 with the new JSX transform (no `import React from 'react'` needed; only specific hooks/types are imported).
- Function components only — no class components.
- Default-export the component from each `.tsx` file. Props interface is declared just above the component.
- State hooks colocate with the component; helpers (e.g. `formatarTempo` in `ModalCheckout.tsx`) live above the component as plain functions, not inside it.
- Conditional rendering: early `if (!isOpen) return null` followed by JSX (see `AlertModal.tsx`, `ModalCheckout.tsx`).
- Styling: **Tailwind CSS** utility classes; combine conditional classes with `clsx`:
  ```tsx
  className={clsx(
    'bg-slate-800 rounded-xl ...',
    isError ? 'border-red-500' : 'border-blue-500'
  )}
  ```
  Use `tailwind-merge` only when consumer-supplied classes need to override defaults; the components in `src/renderer/src/components/` currently rely on `clsx` alone.
- Modal pattern: full-screen `fixed inset-0` overlay, `onClick={onClose}` on the backdrop, `onClick={(e) => e.stopPropagation()}` on the inner card. Reuse this pattern for new modals.

## Error Handling

Three layers, each with its own contract:

1. **Main-process IPC handlers** wrap each handler body in `try/catch`, log via `console.error`, and return a tagged result object — they do not throw across IPC. Pattern from `src/main/index.ts`:
   ```ts
   ipcMain.handle('get-tickets', () => {
     try {
       return dbOperations.getAllActiveTickets()
     } catch (error) {
       console.error('Erro ao buscar tickets:', error)
       return []
     }
   })

   ipcMain.handle('create-ticket', (_event, { placa, tipo }) => {
     try {
       // ...
       return { success: true, id, entrada, billedAsAvulso: subscriberDebtor }
     } catch (error) {
       // return { success: false, error: translateDbError(error) }
     }
   })
   ```
   Either return the data directly (read handlers) or `{ success: boolean, ... }` (write handlers). Never let a thrown error reach the renderer raw.

2. **DB → user message translation** lives in `translateDbError(error: unknown)` (`src/main/db.ts:302`). It maps SQLite `SQLITE_CONSTRAINT` / `UNIQUE constraint failed` to a Portuguese message and falls back to `err.message ?? 'Erro desconhecido ao salvar.'`. Always run DB errors through this before returning to the renderer.

3. **Renderer-side normalization** uses `friendlyError(error: unknown)` (`src/renderer/src/utils/errorHandler.ts`). It performs case-insensitive substring matches on the error message (`timeout`, `printer`, `constraint`, `unique`, `enoent`, `eacces`, ...) and returns a Portuguese sentence. Use this when surfacing errors in `AlertModal`.

`config.ts` follows a "log and recover" pattern: failures in `getConfig`/`saveConfig` are caught, `console.error`-logged, and the function returns a safe default rather than throwing.

## Logging

- No structured logger. The project uses `console.log`, `console.warn`, and `console.error` directly.
- Log messages in main are Portuguese (`'Erro ao buscar tickets:'`, `'Erro ao ler config:'`, `'Não foi possível configurar pastas de cache:'`).
- Renderer code does **not** log via `console` for user-visible errors — it shows them through `AlertModal` after running through `friendlyError`.

## Comments

- JSDoc with `/** ... */` is used to document public functions, especially in `src/main/calculations.ts`, `src/main/garageDates.ts`, `src/renderer/src/utils/masks.ts`, and `src/renderer/src/hooks/useBarcodeScanner.ts`.
- Inline `//` comments explain Brazilian-Portuguese domain rules (e.g., the pernoite formula, plate normalization, the cache-path workaround in `src/main/index.ts:5-21`).
- No `@param` or `@returns` tags by default — descriptive prose only. Add `@param` only when the parameter name alone is not self-explanatory (see `calcularValor`'s `getDailyUsedForDate` and `aplicarPernoite`).

## Function Design

- Pure helpers favor explicit parameters over closures (`calcularValor` takes `getDailyUsedForDate` callback rather than reading the DB itself, which is what makes it testable).
- Keep functions small and single-purpose; mid-size files (`calculations.ts` ~94 lines, `garageDates.ts` ~5 lines) are normal.
- The DB module is the exception: `src/main/db.ts` is the largest single file in the project and bundles **all** prepared statements + the `dbOperations` facade. New statements should be added to the same `stmts` object and surfaced through `dbOperations`.
- Domain validation always **normalizes plates** the same way: `value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)` (see `plateToRaw` in `masks.ts` and the `normalizePlate` arrow in `src/main/index.ts:103`). Reuse `plateToRaw` rather than re-implementing the regex.

## Date / Time Conventions

- All persisted timestamps are **ISO strings** (`new Date().toISOString()`); local-day keys are `YYYY-MM-DD`. Use `localDateKeyFromDate` (`src/main/calculations.ts`) when bucketing by civil day.
- Renderer uses `date-fns` (`format`, `differenceInMinutes`, `startOfMonth`, ...). Main uses native `Date` math. Don't mix `date-fns` into the main process.

## Currency / Money

- Currency math is in **Reais (BRL)** stored as `number`. Format for display with `valor.toFixed(2).replace('.', ',')` (see `ModalCheckout.tsx:44`). Do not introduce `Intl.NumberFormat` without checking existing call sites.

## Tailwind / CSS

- Tailwind 3.4 (`tailwind.config.js`, `postcss.config.js`, autoprefixer). Source styles in `src/renderer/src/assets/base.css` and `main.css`.
- Color palette is dark — `bg-slate-800`, `bg-gray-800`, `bg-black/60`, `text-white`, with reds (`bg-red-600`) and blues (`bg-blue-600`) for actions. Match this when adding new UI to keep theme consistency.

---

*Convention analysis: 2026-05-09*
