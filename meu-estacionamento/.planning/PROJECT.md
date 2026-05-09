# Estacionamento Software (`meu-estacionamento`)

## What This Is

Aplicativo desktop Electron de gestão de estacionamento, instalado em uma máquina **sem internet** no balcão de um estacionamento operado **dentro de uma academia** (operadores são empresa terceira, não têm vínculo com a academia). Cobre operação de tickets, mensalistas, pagamentos (Pix), e a tolerância diária de minutos grátis por veículo. Distribuído e atualizado via pendrive.

## Core Value

Operação confiável no balcão **sem internet**: entrada, saída e cobrança rápidas e corretas, com a tolerância de tempo grátis (90 min padrão / 150 min mensalista) calculada certo — inclusive nos casos de famílias que compartilham o mesmo carro mas chegam em horários diferentes.

## Requirements

### Validated

<!-- Capacidades já entregues e em uso pelo cliente, inferidas do código existente (.planning/codebase/). -->

- ✓ Login local com senhas administrativas — existing
- ✓ Operação de tickets (entrada/saída) — existing
- ✓ Cadastro e gestão de clientes mensalistas (`MENSAL_CARRO`) — existing
- ✓ Histórico de pagamentos (método Pix) — existing
- ✓ Tolerância de 90 min/dia por placa, reset às 00:00, cobrança de R$4/h após estourar — existing
- ✓ Operações destrutivas protegidas por senha (`exclude-ticket`, `delete-client`, `exclude-all-active-tickets`) — existing
- ✓ Persistência local em SQLite (`parking.db`) — existing
- ✓ Empacotamento Electron via `electron-vite` + `electron-builder` — existing
- ✓ Distribuição por pendrive (sem auto-update funcional) — existing
- ✓ UI em React + Tailwind (renderer) — existing

### Active

<!-- Escopo deste milestone (v1.next). -->

- [ ] **Cadastro de grupo familiar:** associar múltiplos CPFs a uma mesma placa
- [ ] **Seletor de membro na entrada:** quando a placa digitada pertence a um grupo familiar, exibir lista de membros para o operador escolher quem chegou
- [ ] **Tolerância por CPF para placas família:** contar os 90 min do membro selecionado, não da placa
- [ ] **Bônus mensalista preservado:** placa mensalista + família → cada membro tem 150 min/dia
- [ ] **Senhas administrativas configuráveis:** remover `Kefit2026` e `murilo123@` do código fonte; mover para armazenamento configurável (banco com hash) com tela de troca pelo admin
- [ ] **Saneamento do `parking.db` no git:** remover do controle de versão (incluindo histórico), `.gitignore`, criar `seed.db` vazio para devs
- [ ] **Backup automático local do `parking.db`:** rotação de cópias locais + exportação manual para pendrive (sem internet)
- [ ] **Refatoração do `src/renderer/src/App.tsx`:** quebrar o god-component (1839 linhas) em componentes menores antes/durante a entrada das novas features

### Out of Scope

- **Auto-updater real (Squirrel/electron-updater)** — máquina do cliente não tem internet; atualizações continuam por pendrive
- **Integração com sistema da academia** — operadores são empresa separada, não há vínculo
- **Multi-tenant / múltiplos estacionamentos** — produto é instalação única por cliente
- **Sync em nuvem ou backup remoto** — sem internet no ambiente
- **Mobile / web** — produto é desktop Electron, sem planos de portar
- **Reescrita total da regra de tolerância para o sistema todo** — o caso família é tratado como exceção registrada, não como mudança global da regra por placa

## Context

- **Brownfield em produção:** o software já roda em um cliente real. Esta nova seção é uma evolução, não um greenfield.
- **Quem usa:** operadores não-técnicos no balcão de um estacionamento dentro de uma academia (em SP/Brasil pelos números no banco).
- **Idioma:** UI e identificadores de domínio em **pt-BR** (`MENSAL_CARRO`, `Pix`, "garagem", "horario", etc.).
- **Distribuição:** instalador entregue via pendrive; nenhuma comunicação outbound.
- **Stack atual** (do `/gsd-map-codebase`): Electron + `electron-vite` (main/preload/renderer), React 18 + Tailwind CSS no renderer, TypeScript em todo lugar, Vitest para testes, SQLite local. Detalhes em `.planning/codebase/STACK.md` e `.planning/codebase/ARCHITECTURE.md`.
- **Achados da auditoria** (`.planning/codebase/CONCERNS.md`) que motivam parte deste milestone:
  - Senhas hardcoded em `src/main/index.ts:506-508` (`Kefit2026` ×2, `murilo123@`)
  - `parking.db` rastreado no git com PII real (nome, telefone, CPF-shaped, placas, pagamentos)
  - `App.tsx` com 1839 linhas e nenhum teste de componente
  - Preload expõe tanto API tipada quanto `electronAPI` ampla, enfraquecendo o contrato de IPC
- **Operação contínua:** este milestone abre um modelo de melhorias incrementais — sem prazo fechado, "o quanto antes", entregas iterativas via pendrive.

## Constraints

- **Conectividade:** máquina do cliente **sem internet** — proibido depender de APIs externas, cloud sync, validação remota de licença, telemetria ou auto-updater. Tudo precisa funcionar 100% offline.
- **Distribuição:** atualizações via pendrive — instalador precisa rodar offline em Windows e ser reproducível a partir do repositório.
- **Tipo de usuário:** operadores não-técnicos — mudanças de UX precisam ser robustas a erro humano, sem jargão, com confirmações claras em ações destrutivas.
- **Dados sensíveis:** `parking.db` contém PII real — não pode voltar a ser commitado; backups precisam ser **locais** (HD da máquina ou pendrive), nunca em cloud.
- **Compatibilidade de dados:** schema novo (grupos familiares, senhas configuráveis) precisa migrar dados existentes em produção sem perda — clientes, mensalistas, tickets ativos, histórico de pagamentos tudo continua válido.
- **Localização:** UI, mensagens de erro, logs visíveis ao operador, e identificadores de domínio em **pt-BR**.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Regra de família via cadastro prévio de grupo (não override no momento da entrada) | Reduz erro humano e dá rastreabilidade — operador escolhe um membro de uma lista, não digita CPF/justificativa na hora | — Pending |
| Contagem por CPF **só** para placas registradas como família | Mantém o resto do sistema inalterado e a migração trivial; "exceção" registrada, não mudança global | — Pending |
| Mensalista + família = 150 min/dia por CPF | Preserva o bônus de 1h extra do plano mensalista no nível do membro da família | — Pending |
| Distribuição continua por pendrive — sem auto-updater | Hard constraint do ambiente do cliente (sem internet); investir em auto-updater seria desperdício | ✓ Good |
| Refatorar `App.tsx` antes/junto das novas features | Empilhar regra de família + telas de admin de senha em um god-component de 1839 linhas multiplica risco de regressão | — Pending |
| Senhas admin em hash no banco, configuráveis pela UI | Tirar credencial do código + permitir rotação sem rebuild — atende auditoria sem custo recorrente | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-09 after initialization*
