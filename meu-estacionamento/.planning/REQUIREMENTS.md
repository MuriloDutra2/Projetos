# Requirements: Estacionamento Software (Milestone v2)

**Defined:** 2026-05-09
**Core Value:** Operação confiável no balcão sem internet — entrada, saída e cobrança rápidas e corretas, com a tolerância de 90/150 min calculada certo, inclusive nos casos de famílias que compartilham o mesmo carro.

## v1 Requirements

Requisitos deste milestone. Cada um vai mapear para uma fase no ROADMAP.md.

### Família (FAM)

- [ ] **FAM-01**: Admin pode cadastrar um grupo familiar associando uma placa a múltiplos CPFs (com nome e CPF de cada membro), via tela de administração
- [ ] **FAM-02**: Admin pode editar e remover membros e grupos familiares existentes
- [ ] **FAM-03**: Admin pode visualizar todos os grupos familiares cadastrados em uma listagem pesquisável
- [ ] **FAM-04**: Quando o operador digita uma placa cadastrada como família na entrada, o sistema exibe um seletor com os membros do grupo antes de criar o ticket (operador escolhe quem chegou)
- [ ] **FAM-05**: O ticket gerado para uma placa-família registra o CPF do membro selecionado, não apenas a placa
- [ ] **FAM-06**: O cálculo de tolerância para tickets família usa o saldo do CPF do dia (90 min/dia se não-mensalista, 150 min/dia se mensalista) — não o saldo da placa
- [ ] **FAM-07**: O reset diário às 00:00 zera o saldo de cada CPF de grupo familiar, da mesma forma que zera o saldo das placas comuns

### Senhas Administrativas (AUTH)

- [ ] **AUTH-01**: Senhas administrativas (`exclude-ticket`, `delete-client`, `exclude-all-active-tickets`, e qualquer outra equivalente) são armazenadas no banco com hash seguro (bcrypt ou argon2), nunca em texto-claro no código fonte
- [ ] **AUTH-02**: Admin pode alterar cada senha através de uma tela de configuração protegida — sem necessidade de recompilar/redistribuir o software
- [ ] **AUTH-03**: Migração inicial transfere as senhas atuais para o banco com hash, mantendo a operação em produção funcionando sem intervenção manual
- [ ] **AUTH-04**: Tentativas com senha errada exibem mensagem uniforme (não revela qual senha foi tentada nem se a operação existe), e o evento é registrado em log local

### Segurança do Repositório (SEC)

- [ ] **SEC-01**: `parking.db` é adicionado ao `.gitignore` e removido do controle de versão dali em diante
- [ ] **SEC-02**: Histórico do git é reescrito (via `git filter-repo` ou equivalente) para que `parking.db` saia de todos os commits passados, eliminando a PII real do repositório
- [ ] **SEC-03**: Repositório passa a incluir um `seed.db` vazio (ou um script `npm run db:seed` que o gera) para que devs subam o ambiente sem precisar do banco real
- [ ] **SEC-04**: README documenta o procedimento de obtenção/geração do banco de desenvolvimento e avisa sobre a sensibilidade do `parking.db` em produção
- [ ] **SEC-05**: Antes da reescrita do histórico do git, é feito um backup local explícito do `parking.db` atual do dev — e o procedimento é validado em uma cópia do repositório antes de aplicar no original
- [ ] **SEC-06**: O empacotamento do electron-builder é configurado/validado para **preservar** o `parking.db` existente do cliente em atualizações futuras (não sobrescrever userData) — testado num cenário simulado de "instalar versão N+1 sobre versão N"

### Backup do Banco (BAK)

- [ ] **BAK-01**: O sistema cria automaticamente cópias locais de `parking.db` em uma pasta de backup configurável, com rotação (manter últimos N backups, padrão 7)
- [ ] **BAK-02**: Operador pode acionar manualmente um backup imediato a partir da UI
- [ ] **BAK-03**: Operador pode exportar o banco para um pendrive ou pasta externa via UI (sem dependência de internet)
- [ ] **BAK-04**: Operador pode restaurar um backup local ou de pendrive a partir da UI, com confirmação destrutiva protegida por senha administrativa
- [ ] **BAK-05**: Backups usam cópia atômica (SQLite Online Backup API ou equivalente) — não corrompem o banco se o app for fechado durante a cópia

### Refatoração do Renderer (REF)

- [ ] **REF-01**: `src/renderer/src/App.tsx` é dividido em componentes coesos por área funcional (entrada, saída/cobrança, mensalistas, grupos familiares, admin/senhas, backup) — nenhum arquivo do renderer ultrapassa ~400 linhas
- [ ] **REF-02**: Chamadas IPC do renderer são acessadas via hooks/serviços tipados, e não diretamente pelo `window.electronAPI` espalhado pelos componentes
- [ ] **REF-03**: A refatoração mantém todos os testes existentes passando, e a operação principal (entrada → saída → cobrança para placa avulsa, mensalista, e família) é validada via UAT manual documentado

## v2 Requirements

Reconhecidos mas adiados — fora deste milestone, não aparecem no roadmap atual.

### Hardening de IPC (IPC)

- **IPC-01**: Remover o canal genérico `electronAPI` do preload, deixando apenas a `api` tipada com allow-list
- **IPC-02**: Validação de input (zod ou equivalente) em todos os handlers IPC sensíveis

### Cobertura de Testes (TEST)

- **TEST-01**: Testes de componente React para os fluxos principais (entrada, saída, cobrança)
- **TEST-02**: Cobertura de regressão automatizada para a regra de tolerância (placa, família, mensalista)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-updater funcional (electron-updater + servidor) | Máquina do cliente sem internet — atualizações continuam por pendrive |
| Assinatura de instaladores (`signAndEditExecutable`) | Sem orçamento/processo de code signing definido neste milestone; risco aceito |
| Integração com sistema da academia | Operadores são empresa terceira; sem vínculo nem requisito do cliente |
| Multi-tenant / vários estacionamentos por instalação | Produto é instalação única por cliente |
| Mudança global da regra de tolerância (CPF para todos) | Risco e complexidade altos; o caso família é tratado como exceção registrada |
| Sync em nuvem do `parking.db` | Sem internet no ambiente; backup é local + pendrive |
| Mobile / web | Produto é desktop Electron, sem planos de portar |

## Traceability

Inicialmente vazio — preenchido pelo `gsd-roadmapper` na criação do ROADMAP.md.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FAM-01 | TBD | Pending |
| FAM-02 | TBD | Pending |
| FAM-03 | TBD | Pending |
| FAM-04 | TBD | Pending |
| FAM-05 | TBD | Pending |
| FAM-06 | TBD | Pending |
| FAM-07 | TBD | Pending |
| AUTH-01 | TBD | Pending |
| AUTH-02 | TBD | Pending |
| AUTH-03 | TBD | Pending |
| AUTH-04 | TBD | Pending |
| SEC-01 | TBD | Pending |
| SEC-02 | TBD | Pending |
| SEC-03 | TBD | Pending |
| SEC-04 | TBD | Pending |
| SEC-05 | TBD | Pending |
| SEC-06 | TBD | Pending |
| BAK-01 | TBD | Pending |
| BAK-02 | TBD | Pending |
| BAK-03 | TBD | Pending |
| BAK-04 | TBD | Pending |
| BAK-05 | TBD | Pending |
| REF-01 | TBD | Pending |
| REF-02 | TBD | Pending |
| REF-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 0 (será preenchido pelo roadmapper)
- Unmapped: 25 ⚠️ (resolvido após criação do ROADMAP.md)

---
*Requirements defined: 2026-05-09*
*Last updated: 2026-05-09 after initial definition*
