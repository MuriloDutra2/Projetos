# Roadmap: Estacionamento Software (Milestone v2)

## Overview

Milestone evolutivo num produto Electron + React + SQLite já em produção num cliente real, sem internet, distribuído por pendrive. A jornada começa pelo *enabling work* (quebrar o `App.tsx` de 1839 linhas) para destravar tudo o que vem depois, segue para o saneamento crítico do repositório (remover PII real do git e proteger atualizações futuras), instala o backup local + restore via UI, troca as senhas hardcoded por senhas configuráveis com hash, e finalmente entrega a feature de fato visível ao operador: tolerância por CPF para placas-família. Cada fase entrega capacidade observável, sem quebrar a operação atual em produção.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Refatoração do Renderer** - Quebrar o `App.tsx` god-component em views/serviços tipados antes de empilhar novas features
- [ ] **Phase 2: Saneamento do Repositório** - Remover PII do git, blindar `.gitignore`, garantir que atualizações preservem o `parking.db` do cliente
- [ ] **Phase 3: Backup e Restore Local** - Backup automático com rotação + export/restore via UI por pendrive
- [ ] **Phase 4: Senhas Administrativas Configuráveis** - Tirar senhas do código fonte, mover para hash no banco com tela de troca e log de tentativas
- [ ] **Phase 5: Grupos Familiares e Tolerância por CPF** - Cadastro de grupo família + seletor de membro na entrada + cálculo dos 90/150 min por CPF

## Phase Details

### Phase 1: Refatoração do Renderer
**Goal**: Renderer fica modular o suficiente (cada arquivo < ~400 linhas, IPC só via hooks tipados) para receber as próximas features sem regredir os fluxos atuais
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: REF-01, REF-02, REF-03
**Success Criteria** (what must be TRUE):
  1. O fluxo principal (entrada → saída → cobrança) funciona identicamente para placa avulsa e mensalista, validado pelo checklist de UAT manual
  2. Nenhum arquivo do renderer ultrapassa ~400 linhas — cada view (`inicio`, `historico`, `relatorio`, `mensalistas`, `financeiro`, `excluidos`, `configuracoes`) vive no seu próprio arquivo
  3. Componentes do renderer chamam IPC apenas via hooks/serviços tipados, sem `window.electronAPI.ipcRenderer.invoke(...)` espalhado pelos componentes
  4. Toda a suíte Vitest existente (`calculations.test.ts`, `garageDates.test.ts`) continua passando, e `npm run typecheck` + `npm run lint` ficam verdes
**Plans**: TBD
**UI hint**: yes

### Phase 2: Saneamento do Repositório
**Goal**: Repositório deixa de carregar PII real e o instalador deixa de ameaçar o `parking.db` do cliente em atualizações
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. `git log --all -- parking.db` retorna vazio após a reescrita, e `parking.db` (junto de `*.db-journal/-wal/-shm`) está no `.gitignore`
  2. Dev novo consegue subir o ambiente do zero usando um `seed.db` versionado (ou script `npm run db:seed`), sem precisar de cópia do banco real
  3. README documenta: como obter/gerar o banco de dev, sensibilidade do `parking.db` em produção, e o procedimento de backup pré-reescrita do histórico
  4. Antes da reescrita ser aplicada no `origin`, existe um backup local explícito do `parking.db` do dev e o procedimento foi validado em uma cópia do repositório
  5. Em um teste de instalar o build N+1 sobre uma instalação N existente, o `parking.db` do `userData` é preservado (clientes, mensalistas, tickets, pagamentos intactos)
**Plans**: TBD

### Phase 3: Backup e Restore Local
**Goal**: Operador tem como proteger e restaurar o banco sem internet — automático no disco e manual para pendrive — usando cópia atômica que não corrompe o banco
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: BAK-01, BAK-02, BAK-03, BAK-04, BAK-05
**Success Criteria** (what must be TRUE):
  1. Após uso normal por alguns dias, a pasta de backup local contém múltiplas cópias rotacionadas do `parking.db` (padrão: últimos 7), criadas automaticamente sem ação do operador
  2. Operador consegue, pela UI, disparar um backup imediato e ver o arquivo aparecer na pasta de backups
  3. Operador consegue, pela UI, exportar o `parking.db` para um pendrive ou pasta externa escolhida via diálogo do sistema, sem nenhuma chamada de rede
  4. Operador consegue, pela UI, restaurar um backup (local ou de pendrive) — com confirmação destrutiva exigindo senha administrativa antes de sobrescrever o banco em uso
  5. Backups feitos enquanto o app está em uso não corrompem o banco (uso da Online Backup API do SQLite ou equivalente), verificado abrindo a cópia em uma instância separada
**Plans**: TBD
**UI hint**: yes

### Phase 4: Senhas Administrativas Configuráveis
**Goal**: Senhas administrativas saem do código fonte, ficam armazenadas com hash no banco, são trocáveis pela UI sem rebuild, e tentativas erradas são tratadas com mensagem uniforme + log local
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. Buscar `Kefit2026` ou `murilo123@` no código fonte e nos artefatos do build não retorna nenhuma ocorrência viva — as senhas vivem apenas como hash no banco
  2. Admin consegue, por uma tela protegida, alterar cada senha (`exclude-ticket`, `delete-client`, `exclude-all-active-tickets`) e a nova senha passa a valer imediatamente, sem rebuild
  3. Após instalar a nova versão sobre o banco de produção atual, as três senhas antigas continuam funcionando até serem trocadas (migração transferiu para hash sem intervenção manual)
  4. Tentativa com senha errada exibe sempre a mesma mensagem genérica (sem revelar qual senha foi tentada nem se a operação existe), e o evento fica registrado em log local consultável
**Plans**: TBD
**UI hint**: yes

### Phase 5: Grupos Familiares e Tolerância por CPF
**Goal**: Famílias que compartilham um carro têm a tolerância de 90/150 min contada por CPF do membro que chegou — sem mudar a regra geral por placa para o resto do sistema
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: FAM-01, FAM-02, FAM-03, FAM-04, FAM-05, FAM-06, FAM-07
**Success Criteria** (what must be TRUE):
  1. Admin consegue criar, editar, remover e listar (com busca) grupos familiares — cada grupo com uma placa e múltiplos membros (nome + CPF), pela UI
  2. Quando o operador digita uma placa cadastrada como família, o sistema mostra um seletor com os membros do grupo *antes* de criar o ticket; a entrada só é registrada após o operador escolher quem chegou
  3. O ticket de uma placa-família registra o CPF do membro escolhido e a tolerância no momento da saída é calculada contra o saldo do dia daquele CPF (90 min se não-mensalista, 150 min se a placa for mensalista) — não contra o saldo da placa
  4. Reset diário às 00:00 zera o saldo de cada CPF de família, da mesma forma que zera o saldo das placas comuns — verificado executando duas entradas em dias diferentes para o mesmo CPF
  5. Para placas que **não** são família, o comportamento atual (saldo por placa) permanece idêntico — fluxo avulso e mensalista comum não regridem
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Refatoração do Renderer | 0/TBD | Not started | - |
| 2. Saneamento do Repositório | 0/TBD | Not started | - |
| 3. Backup e Restore Local | 0/TBD | Not started | - |
| 4. Senhas Administrativas Configuráveis | 0/TBD | Not started | - |
| 5. Grupos Familiares e Tolerância por CPF | 0/TBD | Not started | - |

---
*Roadmap created: 2026-05-09*
