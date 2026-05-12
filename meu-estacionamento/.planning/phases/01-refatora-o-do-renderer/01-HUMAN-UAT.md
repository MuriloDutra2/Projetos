---
status: partial
phase: 01-refatora-o-do-renderer
source: [01-VERIFICATION.md]
started: "2026-05-12"
updated: "2026-05-12"
---

## Current Test

[awaiting human testing]

## Tests

### 1. Entry/exit flow integrity
expected: Run `npm run dev`, register a vehicle entry, confirm ticket appears, click exit, confirm in ModalCheckout. Verify printEntry/printExit fire via service (no ipcRenderer directly). Full cycle works identically to pre-refactor.
result: [pending]

### 2. Devedor/garagem branch logic
expected: Test with a debtor mensalista and a GARAGEM-type mensalista to confirm the two decision modals in Inicio.tsx appear correctly (verbatim logic from App.tsx).
result: [pending]

### 3. Ctrl+N shortcut
expected: In the Mensalistas view, press Ctrl+N. ModalNovoCliente opens via mensalistasRef.current?.openNewClientModal().
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
