# Testing Patterns

**Analysis Date:** 2026-05-09

## Test Framework

**Runner:**
- Vitest 3.2 (`vitest` devDependency in `package.json`)
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest's built-in `expect` (Jest-compatible API). Imported per file: `import { describe, it, expect } from 'vitest'`.

**Mocking:**
- Vitest built-ins available (`vi.mock`, `vi.fn`) — **not currently used**. Today's tests are pure-function unit tests with hand-rolled stub callbacks.

**Run Commands** (from `package.json`):

```bash
npm run test           # vitest run — all tests, terminal output
npm run test:report    # vitest run --reporter=json --outputFile=test-results.json
```

There is **no watch script**, **no coverage script**, and **no UI script** wired in. To run watch mode locally: `npx vitest`. To run coverage: `npx vitest run --coverage`.

## Vitest Configuration (`vitest.config.ts`)

```ts
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/main/calculations.ts'],
      exclude: ['**/*.test.ts', '**/node_modules/**']
    },
    reporters: ['default'],
    outputFile: undefined
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
```

Key implications:
- **`environment: 'node'`** — there is no `jsdom`/`happy-dom` setup. React component tests (DOM, render) cannot run as configured. New UI tests would need a per-file `// @vitest-environment jsdom` comment plus an environment package (`jsdom` or `@testing-library/react`, neither installed today).
- **`include: ['__tests__/**/*.test.ts']`** — only `.test.ts` files under the top-level `__tests__/` folder are collected. Tests colocated next to source (e.g., `src/main/foo.test.ts`) would be ignored.
- **Coverage scope is intentionally narrow:** `include: ['src/main/calculations.ts']`. Coverage reports cover only the cobrança engine; everything else is excluded by definition. Update this `include` array when adding coverage targets (e.g., add `'src/main/garageDates.ts'`, `'src/renderer/src/utils/masks.ts'`).
- **`@` alias** is registered for resolution but tests currently use **relative imports** (`../../src/main/calculations`). Either style works.
- **No `setupFiles`** — every test imports what it needs from scratch.

## Test File Organization

Layout (`__tests__/`):

```
__tests__/
├── README.md              ← Setup / how-to (Portuguese)
├── CASOS-DE-TESTE.md      ← Full case catalogue per category, expected results
├── fixtures/              ← Empty (.gitkeep only); reserved for JSON/TS scenarios
└── unit/
    ├── calculations.test.ts
    └── garageDates.test.ts
```

- **Co-location is NOT the convention.** All tests live in the top-level `__tests__/` directory.
- **Naming:** `<module>.test.ts` (e.g., `calculations.test.ts`, `garageDates.test.ts`).
- **`__tests__/integration/`** is documented in `__tests__/README.md` but does not yet exist. The catalog (`__tests__/CASOS-DE-TESTE.md` sections 5–9) lists 29 integration cases covering tickets, mensalistas, daily usage, daily reports, and finance — all currently UNIMPLEMENTED because `src/main/db.ts` opens its SQLite handle at import time using Electron's `app.getPath('userData')`, which crashes outside an Electron runtime.
- **`__tests__/fixtures/`** is empty (`.gitkeep` only). The README references "cenarios-cobranca.json" as a future placeholder.

## Test Structure

Suite organization (`__tests__/unit/calculations.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import {
  calcularValor,
  isPernoite,
  minutosDaEstadia,
  splitStayIntoLocalDaySegments,
  localDateKeyFromDate
} from '../../src/main/calculations'
import type { GetDailyUsedForDate } from '../../src/main/calculations'

describe('calcularValor', () => {
  describe('Avulso (90 min grátis)', () => {
    it('1.1 Dentro do grátis (89 min)', () => {
      const entrada = hoje(10, 0)
      const saida = new Date(entrada)
      saida.setMinutes(saida.getMinutes() + 89)
      expect(calcularValor(entrada, 90, saida.toISOString(), u(0), false)).toBe(0)
    })
    // ...
  })
})
```

Patterns observed:
- **Two levels of `describe`**: outer = function under test, inner = scenario group (e.g., `'Avulso (90 min grátis)'`, `'Mensalista (150 min grátis)'`, `'Pernoite'`).
- **Test titles** are numbered to match `__tests__/CASOS-DE-TESTE.md` (`'1.1 Dentro do grátis (89 min)'`, `'2.4 Saída 09h (fora 00h–08h) → false'`). When you add a new case, add it to the markdown catalog AND keep the same number prefix.
- **Test titles are Portuguese**, including currency, accents, and the `→` arrow for expected outcomes.
- Single `expect` per `it` is the norm; some `it` blocks assert two derived properties (`expect(v).not.toBe(50); expect(v).toBe(36)`).
- No `beforeEach` / `afterEach` — each test builds its inputs inline.

**Helper functions** are defined once at the top of the file and reused throughout (calculations test):

```ts
/** Uso diário constante (mesmo dia civil nos testes de estacionamento curto). */
function u(n: number): GetDailyUsedForDate {
  return (_dateKey: string) => n
}

/** Cria data ISO no mesmo dia (horário local). */
function hoje(hour: number, minute: number): string {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

/** Cria data ISO em um dia específico (YYYY-MM-DD) e hora (horário local). */
function dia(datestr: string, hour: number, minute: number): string {
  const [y, m, d] = datestr.split('-').map(Number)
  const date = new Date(y, m - 1, d, hour, minute, 0, 0)
  return date.toISOString()
}
```

When you need date input, prefer `dia('YYYY-MM-DD', h, m)` for stability; use `hoje(h, m)` only when the test logic is invariant under the current calendar day.

## Mocking Patterns

**Approach today:** No `vi.mock`. `calcularValor` was designed for **dependency injection** — it takes a `getDailyUsedForDate: GetDailyUsedForDate` callback. Tests inject:

- `u(0)` — a stub returning the same minutes for every day.
- A lookup map for multi-day cases:
  ```ts
  const lookup: Record<string, number> = {
    '2025-01-15': 80,
    '2025-01-16': 0
  }
  const getByDay: GetDailyUsedForDate = (key) => lookup[key] ?? 0
  ```

**Guidelines for new tests:**
- **DO** keep main-process pure functions (calculations, masks, date helpers) free of `electron`, `better-sqlite3`, and `fs` so they remain testable as plain Node modules.
- **DO** prefer explicit dependency injection over `vi.mock` — it matches the existing style and keeps tests readable.
- **DO NOT** import from `src/main/db.ts`, `src/main/printer.ts`, or `src/main/config.ts` in unit tests — they perform `app.getPath(...)` / `Database(...)` / printer I/O at import time.
- **DO NOT** import renderer components from a Node-environment test — JSX won't render without a DOM env (none configured).

If a future test must mock the Electron `app` object, the standard recipe would be `vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))` placed before the import under test, but this pattern is not yet present in the repo.

## What Is Tested

Currently exercised (per `test-results.json`: **9 suites, 26 passing, 0 failing**):

| File | Module | Cases |
|------|--------|-------|
| `__tests__/unit/calculations.test.ts` | `src/main/calculations.ts` | `calcularValor` (18 cases), `isPernoite` (5 cases), `minutosDaEstadia` (3 cases), `splitStayIntoLocalDaySegments` (3 cases), `localDateKeyFromDate` (1 case), per-day quota (1 case) |
| `__tests__/unit/garageDates.test.ts` | `src/main/garageDates.ts`, `src/renderer/src/utils/masks.ts` | `effectiveBillingDayInMonth` (2), `parseDdMm` (2), `maskDdMm` (1) |

`src/renderer/src/utils/masks.ts` is partially covered (only `maskDdMm` and `parseDdMm`). `maskCPF`, `maskPhone`, `maskPlate`, `plateToRaw`, `validatePlate`, `validateDate`, and `unmask` have no automated tests.

## What Is NOT Tested

These are listed in `__tests__/CASOS-DE-TESTE.md` as planned but **not yet implemented**:

- **`translateDbError`** in `src/main/db.ts:302` — 4 documented unit cases (CASOS 4.1–4.4) are not yet wired to a test file. These are pure-function tests but require avoiding the `Database(...)` side effect at module import (e.g., extract `translateDbError` to its own module).
- **DB integration (CASOS 5–9, 29 cases):** tickets CRUD, mensalistas CRUD, daily free-minute usage, daily reports, financial history. Blocked by the Electron-coupled `db.ts` constructor; the README explicitly notes a test helper or separate test DB module is needed.
- **IPC handlers in `src/main/index.ts`** — none tested.
- **Renderer:** `src/renderer/src/App.tsx`, all components in `src/renderer/src/components/`, and the `useBarcodeScanner` hook are not tested. No React testing setup exists.
- **`friendlyError`** in `src/renderer/src/utils/errorHandler.ts` — 7 substring-match branches, none covered.
- **`printer.ts`, `config.ts`** — not covered.

## Coverage

- Provider: `v8`, reporters `['text', 'json']`.
- Coverage scope is gated to `src/main/calculations.ts` only (see `vitest.config.ts`). Other files do not appear in reports even when imported by tests.
- No coverage threshold is enforced; CI does not gate merges on coverage.
- Run with `npx vitest run --coverage` — there is no `npm run coverage` shortcut.

## JSON Test Report (`test-results.json`)

`npm run test:report` writes `test-results.json` to the repo root using Vitest's JSON reporter. The current file shows the canonical structure (numTotalTests, numPassedTests, numFailedTests, suite-level `assertionResults` with `fullName`, `status`, `failureMessages`, `duration`). The README recommends scheduling this nightly (Windows Task Scheduler / cron) and gating deploys on the file:

> "Antes de cada deploy: Rode `npm run test` (ou `npm run test:report`) e só faça o deploy se todos os testes passarem."

If you change test names, also update `__tests__/CASOS-DE-TESTE.md` so the JSON case IDs (`'1.1'`, `'2.4'`, ...) remain meaningful.

## Manual UAT — `TESTES-ANTES-DO-PENDRIVE.md`

This is a **manual smoke-test checklist** in Portuguese, run by a human against the built `.exe` before copying the installer to a USB stick for delivery. It is the project's de-facto release acceptance protocol since automated end-to-end coverage does not exist.

**Source:** `TESTES-ANTES-DO-PENDRIVE.md` (44 lines).
**Trigger:** before copying `dist\meu-estacionamento-1.0.0-setup.exe` to the pendrive.
**Sections:**

1. **Instalação** — Installer runs without errors; Start menu / desktop shortcut appears with the correct (non-default-Electron) icon.
2. **Primeira execução** — App launches without DB errors; window and taskbar icon look correct.
3. **Funcionalidades principais** — Manual scenarios:
   - Entrada de veículo (create ticket).
   - Saída de veículo (checkout: value + saída persisted).
   - Assinantes (create + verify in listings).
   - Impressora (configure printer; print a ticket / receipt).
4. **Dados persistentes** — Restart app and verify tickets + assinantes persist; optional check of `%APPDATA%\KF Estacionamento\` for `parking.db` and `config.json`.
5. **Desinstalação (opcional)** — Uninstall via Painel de Controle and reinstall to validate clean install.

This checklist is **not automated** and does not run in CI. Treat it as a release blocker for installer changes, printer integration changes, DB schema migrations, and Electron version bumps.

## Common Patterns to Reuse

**Pure-function math test (preferred):**
```ts
describe('myCalc', () => {
  it('returns 0 within free minutes', () => {
    expect(myCalc(entrada, saida, u(0))).toBe(0)
  })
})
```

**Date input — stable:**
```ts
const entrada = dia('2025-01-15', 19, 0)
const saida = dia('2025-01-16', 7, 0)
```

**Date input — relative to today:**
```ts
const entrada = hoje(10, 0)
const saida = new Date(entrada)
saida.setMinutes(saida.getMinutes() + 91)
```

**Stub for `GetDailyUsedForDate`:**
```ts
const u = (n: number): GetDailyUsedForDate => () => n
const byDay: GetDailyUsedForDate = (key) => lookupTable[key] ?? 0
```

## Async / Error Testing

No async or error-throwing tests exist yet. When adding them, follow Vitest's standard `await expect(fn()).rejects.toThrow(...)` and `expect(() => fn()).toThrow(...)` forms; there is no project-specific wrapper to use.

---

*Testing analysis: 2026-05-09*
