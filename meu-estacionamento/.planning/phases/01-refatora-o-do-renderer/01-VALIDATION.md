---
phase: 1
slug: refatora-o-do-renderer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run typecheck && npm run lint && npm run test:unit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck && npm run lint`
- **After every plan wave:** Run `npm run typecheck && npm run lint && npm run test:unit`
- **Before `/gsd-verify-work`:** Full suite must be green + UAT checklist (`TESTES-ANTES-DO-PENDRIVE.md`) must pass manually
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| services+types | 01 | 1 | REF-02 | — | No `window.api` in components | lint+type | `npm run typecheck && npm run lint` | ✅ | ⬜ pending |
| preload-fix | 01 | 1 | REF-02 | — | `printEntry`/`printExit` exported in preload | type | `npm run typecheck` | ✅ | ⬜ pending |
| dialog-provider | 01 | 1 | REF-01 | — | Provider < 400 lines | lint+type | `npm run typecheck && npm run lint` | ✅ | ⬜ pending |
| view-excluidos | 01 | 2 | REF-01 | — | Excluidos.tsx < 400 lines, no window.api | grep+type | `npm run typecheck` | ✅ | ⬜ pending |
| view-configuracoes | 01 | 2 | REF-01 | — | Configuracoes.tsx < 400 lines, no window.api | grep+type | `npm run typecheck` | ✅ | ⬜ pending |
| view-historico | 01 | 2 | REF-01 | — | Historico.tsx < 400 lines, no window.api | grep+type | `npm run typecheck` | ✅ | ⬜ pending |
| view-relatorio | 01 | 2 | REF-01 | — | Relatorio.tsx < 400 lines, no window.api | grep+type | `npm run typecheck` | ✅ | ⬜ pending |
| view-financeiro | 01 | 2 | REF-01 | — | Financeiro.tsx < 400 lines, no window.api | grep+type | `npm run typecheck` | ✅ | ⬜ pending |
| view-mensalistas | 01 | 2 | REF-01, REF-02 | — | Mensalistas.tsx < 400 lines, no window.api | grep+type | `npm run typecheck` | ✅ | ⬜ pending |
| view-inicio | 01 | 2 | REF-01, REF-02 | — | Inicio.tsx < 400 lines, no window.api | grep+type | `npm run typecheck` | ✅ | ⬜ pending |
| hooks | 01 | 3 | REF-02 | — | Hooks compile, no window.api in components | type | `npm run typecheck` | ✅ | ⬜ pending |
| app-cleanup | 01 | 3 | REF-01, REF-02, REF-03 | — | App.tsx delegates cleanly; all gates green | all | `npm run typecheck && npm run lint && npm run test:unit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No Wave 0 needed — existing test infrastructure covers all phase requirements.

The 2 existing unit tests (`calculations.test.ts`, `garageDates.test.ts`) test main process logic and are unaffected by renderer changes. Renderer has no unit tests — REF-03 mandates only that existing tests remain green.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fluxo avulso: entrada → saída → cobrança | REF-03 | Electron renderer, no test harness | Seguir `TESTES-ANTES-DO-PENDRIVE.md` §"Fluxo Avulso" |
| Fluxo mensalista: entrada → saída | REF-03 | Electron renderer, no test harness | Seguir `TESTES-ANTES-DO-PENDRIVE.md` §"Mensalista" |
| Fluxo garagem/funcionário/devedor | REF-03 | Electron renderer, no test harness | Seguir `TESTES-ANTES-DO-PENDRIVE.md` §"Casos Especiais" |
| Impressão de ticket (entrada e saída) | REF-02 | Requires physical/virtual printer | Verificar `printEntry`/`printExit` disparam sem erro no console |
| Nenhum arquivo ultrapassa ~400 linhas | REF-01 | ESLint `max-lines` não ativo (D-08) | `Get-ChildItem src\renderer\src -Recurse -Filter *.tsx \| Where-Object { (Get-Content $_.FullName).Count -gt 400 }` |
| Zero chamadas diretas a `window.api` nos componentes | REF-02 | Grep pós-execução | `grep -r "window\.api\." src/renderer/src/{views,components,hooks,providers}` → deve retornar vazio |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
