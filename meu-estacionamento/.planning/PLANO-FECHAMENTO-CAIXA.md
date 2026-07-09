# Plano — Correções financeiras + Fechamento de caixa por turno (12h)

**Data:** 09/07/2026
**Motivação:** Gerentes reportaram divergência no fechamento de caixa e pediram fechamento a cada 12h (troca de turno).
**Análise de origem:** 5 causas identificadas (ver seção "Diagnóstico" abaixo).

---

## Princípio de segurança (regra de ouro deste plano)

> **O fluxo de armazenamento de veículos (entrada → pátio → saída → cobrança) não muda.**

Tudo neste plano é **leitura** (novas queries/agregações) ou **aditivo** (coluna nullable, tabela nova).
Nenhuma alteração no caminho de escrita dos tickets, exceto a Fase 4 (forma de pagamento),
que é opcional e com fallback — detalhado lá.

### O que é intocável e por quê

| Componente | Motivo |
|---|---|
| Formato das datas gravadas (`new Date().toISOString()`, ISO UTC) | O motor de cobrança (`calculations.ts`) faz `new Date(iso)` e calcula em horário local — funciona correto hoje. Mudar o formato quebraria a leitura das linhas antigas (formato misto no banco). |
| `calcularValor`, `splitStayIntoLocalDaySegments`, `isPernoite`, `minutosDaEstadia` | Motor de cobrança do veículo. Já é timezone-correto. Coberto por `__tests__/unit/calculations.test.ts` — roda como rede de regressão em toda fase. |
| `createTicket`, `checkoutTicket`, `excludeTicket` (`db.ts`) | Caminho de escrita do pátio. Fase 4 só ADICIONA um parâmetro opcional. |
| `daily_free_usage` (cota anti-fraude) | Já usa dia civil local via `splitStayIntoLocalDaySegments`. Correto. |
| `getTickets` / pátio ativo / `Inicio.tsx` / impressora | Sem dependência das queries financeiras. |
| Schema existente das tabelas | Migrações só via `ensureColumn` + `CREATE TABLE IF NOT EXISTS` (padrão atual, não-destrutivo). Backup rolling no startup já protege. |

### Mapa de dependências (quem usa o quê)

- `getHistory` (LIMIT 50) → **só** `Financeiro.tsx`. Substituir a fonte de dados do Financeiro não afeta mais ninguém.
- `getHistoryForDay` / `getHistoryLast24h` → só `Historico.tsx` (leitura).
- `getDailyReport` / `saveDailyReport` → só `Relatorio.tsx`.
- `getFinancialHistory` (LIMIT 200) → `Financeiro.tsx` + export CSV.
- `getPlateWasInToday` → **fluxo de entrada de veículo** (Inicio). Usa `date()` UTC — tem o mesmo bug de fuso, MAS é fluxo crítico: corrigir separado, com teste próprio (Fase 1b).
- `hasPaymentInMonth` (strftime UTC) → status de devedor do mensalista (badge "Em atraso"). Não é pátio, mas afeta operação — corrigir na Fase 1b também.
- Branch `feature/lan-sync` em andamento: payloads do `sync_log` são JSON — mudanças aditivas são compatíveis, mas **toda tabela/coluna nova precisa entrar no `logSync`** para não ficar fora da replicação.

---

## Diagnóstico (resumo das 5 causas da divergência)

1. **Fuso misto**: relatórios agregam por `date()` sobre ISO UTC (dia "vira" às 21h locais); telas JS filtram em horário local. Relatório ≠ Financeiro ≠ Histórico.
2. **LIMITs**: total mensal de avulsos soma no máximo 50 tickets (`getHistory` LIMIT 50); renovações LIMIT 200; card "por método" (SQL sem limite) diverge do card principal na mesma tela.
3. **Renovação multi-meses**: N linhas × valor digitado, rótulo ambíguo ("Valor (R$)") — se o operador digita o total, registra N× o valor. Contagem de "planos vendidos" inflada (`is_advance` não é usado nos relatórios).
4. **Snapshot vs ao vivo**: Relatório sempre recalcula; exclusões posteriores mudam o passado silenciosamente.
5. **Avulsos sem forma de pagamento**: impossível conferir a gaveta (dinheiro físico) contra o sistema.
6. **Status financeiro ignora o vencimento** *(confirmado em campo, ver seção abaixo)*: `financialStatus` e `isDebtor` (`db.ts` ~584-599) só verificam `hasPaymentInMonth` com competência do mês-calendário atual — ignoram `expiry_date`. Cliente pago com vencimento futuro pode aparecer "A vencer"/"Em atraso". Como `isDebtor` também alimenta a **entrada do veículo** (`getVehicleSubscription`), o carro do mensalista pago entra como avulso, a saída gera cobrança que não é cobrada → débito fantasma no faturamento → quebra no caixa.

---

## Validação de campo — vídeo do funcionário (09/07/2026)

Vídeo enviado por funcionário do estacionamento (transcrito com whisper), relatando duas situações:

**Situação A — mensalista pago marcado como a vencer/atraso.** Cliente "G.H." pagou
R$ 60 (comprovantes de maquininha: 50 + 10), lançado no sistema, vencimento exibido 09/08.
Status na tela: "A vencer", e no dia seguinte marcaria "Em atraso". Procedimento que a equipe
adota quando marca atraso: registra a placa como avulso → na saída o sistema gera cobrança →
não cobram (cliente já pagou) → débito fantasma + quebra de caixa. **Confirma a causa nº 6**
(status ignora `expiry_date`). → tratada na **Fase 1c**.

**Situação B — fechamento mistura dias.** A tela usada para conferência ("Últimas 24h" /
Histórico) mostra dia 8 e dia 9 juntos ("vai descendo e vai sumindo"); a gerência puxou o
relatório diário da maquininha, não bateu com o sistema (que incluía a noite anterior) e
responsabilizou os funcionários. Pedido literal do funcionário: fechamento **das 7h às 19h e
das 19h às 7h**, com todo valor de cobrança do plantão de 12h dentro do fechamento e um total
no final para bater com a maquininha. **Confirma as causas nº 1/4 e valida a Fase 6 exatamente
como desenhada** (turnos 07:00–19:00 / 19:00–07:00).

---

## Fases

### Fase 1 — Fuso horário nas agregações financeiras (leitura)

**Estratégia:** não tocar na gravação. Criar helper no main:

```ts
/** Converte um dia local (YYYY-MM-DD) em intervalo ISO UTC [início, fim) */
function localDayToIsoRange(dateStr: string): { start: string; end: string }
/** Idem para mês local (YYYY-MM) */
function localMonthToIsoRange(ym: string): { start: string; end: string }
```

Trocar as queries de `date(coluna) = date(?)` para intervalo meio-aberto
`coluna >= ? AND coluna < ?` (comparação lexicográfica de ISO é segura).

**Queries afetadas (todas só de leitura):**
- `getHistoryForDay`, `getHistoryLast24h` (já é range — só conferir)
- `getTotalAvulsosForDay`, `getPlanosVendidosForDay`
- `getFinancialHistoryByMethod`
- `getSavedDailyReport` / `upsertDailyReport`: a chave `report_date` passa a ser o dia local (hoje `date(?)` do string local já resulta no próprio dia — sem migração de dados necessária, validar).

**Fora do escopo da fase (fluxo crítico), vai para 1b:** `getPlateWasInToday`, `hasPaymentInMonth`/`isMensalistaDebtor`.

**Testes:**
- Unit: `localDayToIsoRange` com casos de borda (21h–23h59 local, virada de mês, horário de verão não se aplica ao BR atual mas testar offset fixo).
- Regressão: `npm test` (calculations intocado deve passar sem diff).
- UAT: registrar saída ~22h (simulada), conferir que cai no dia certo no Relatório E no Financeiro.

**Risco ao pátio:** nenhum (nenhuma query do fluxo de entrada/saída é alterada).

### Fase 1b — Fuso nos status operacionais (isolada, com cautela)

- `getPlateWasInToday` (usado na entrada de veículo) e `hasPaymentInMonth` (badge devedor) têm o mesmo bug UTC.
- Corrigir com o mesmo helper, **em commit separado**, com teste unitário próprio e item novo no `TESTES-ANTES-DO-PENDRIVE.md` (entrada de placa repetida no mesmo dia; mensalista pago dia 1 não pode aparecer "Em atraso").
- Se qualquer comportamento estranho aparecer no UAT, esta fase reverte sozinha sem afetar a Fase 1.

### Fase 1c — Status financeiro coerente com o vencimento (caso do vídeo) **[prioridade alta]**

**Problema:** `isMensalistaDebtor`, `isGaragemDebtorInternal` e o `financialStatus` de
`getClients` decidem só por `hasPaymentInMonth(competência do mês-calendário atual)`.
Ignoram `expiry_date` e a maior competência paga. Cliente pago (vencimento futuro) pode
aparecer devedor; `isDebtor` chega até a tela de entrada e induz o operador a registrar o
veículo como avulso.

**Correção (regra única, aplicada nos três pontos):**

```
emDia = expiry_date >= hoje
     OU maxCompetenciaPaga >= competenciaAtual
     OU hasPaymentInMonth(competenciaAtual)          // regra atual, mantida
```

Só se nenhuma das três valer, aplicar a régua do dia 10 (mensal) / billing day (garagem)
para decidir "A vencer" / "Vence hoje" / "Em atraso".

**Cuidados (toca a entrada de veículo via `getVehicleSubscription.isDebtor`):**
- Testes unitários da regra nova com casos: pago adiantado (competência futura), vencimento
  editado manualmente sem pagamento lançado, cliente realmente devedor, garagem com billing day.
- Investigar no banco de produção (com o gerente, sem expor PII) o registro do caso real do
  vídeo para confirmar qual caminho gerou o estado (pagamento com competência futura vs.
  vencimento editado sem pagamento) — isso decide se também precisamos avisar o operador ao
  editar vencimento manualmente.
- UAT: veículo de mensalista pago entra como MENSALISTA (sem cobrança na saída).

**Risco ao pátio:** médio-baixo — muda um critério de status lido na entrada, não muda
escrita nem cálculo de valor. Commit isolado, reversível sozinho.

### Fase 2 — Totais mensais corretos (remover LIMITs do cálculo)

- Novas queries SQL de agregação por intervalo (sem LIMIT): total avulsos do mês, total renovações do mês, transações do período (com paginação simples ou LIMIT alto explícito só para a tabela visual).
- Novo handler IPC `get-finance-month-data` (um único round-trip: totais + por método + transações do mês).
- `Financeiro.tsx` deixa de somar em JS sobre listas truncadas; passa a exibir o que o SQL retornar. `getHistory` (LIMIT 50) continua existindo para não quebrar nada, mas o Financeiro para de usá-lo.
- Export CSV: filtro por mês/período selecionado + sem LIMIT (usar as mesmas queries novas).

**Risco ao pátio:** nenhum (leitura nova; nada existente é removido).

### Fase 3 — Renovação multi-meses sem ambiguidade

- `ModalRenovar`: rótulo vira **"Valor por mês (R$)"** e mostra abaixo, ao vivo: `Total a receber: R$ X (N meses)`.
- Relatórios: contagem de "planos vendidos" usa `is_advance = 0` (1 venda = 1); o **valor** continua somando todas as linhas (caixa recebeu o total hoje — correto).
- Modelo de inserção (N linhas por competência) **não muda** — é o que sustenta o controle de competência/devedores.
- Dados antigos: gerar (uma vez, manual) uma listagem de renovações multi-meses (mesmo cliente + mesmo `payment_date`, >1 linha) para o gerente auditar se houve valor-total digitado como mensal. Não corrigir dado automaticamente.

**Risco ao pátio:** nenhum. Risco financeiro: semântica de dados antigos — mitigado pela auditoria manual.

### Fase 4 — Forma de pagamento no avulso (única fase que toca o checkout)

- `ensureColumn('tickets', 'payment_method', "payment_method TEXT")` — nullable, aditiva.
- `ModalCheckout`: quando `valor > 0`, três botões (Dinheiro / Pix / Cartão) — 1 toque extra no máximo; saída gratuita não pergunta nada.
- `checkoutTicket(id, valor, saida, paymentMethod?)` — parâmetro **opcional**; se ausente, grava `'Não informado'`. Se a UI falhar, o checkout funciona como hoje.
- Incluir `payment_method` no payload do `logSync` (compatível com sync — JSON aditivo).

**Risco ao pátio:** baixo e contido — assinatura aditiva com fallback. Mitigação:
- Item novo no `TESTES-ANTES-DO-PENDRIVE.md`: saída paga com cada forma; saída gratuita; excluir veículo.
- Commit isolado, fácil de reverter.

### Fase 5 — Fechamento de turno (12h) — a feature nova

**Tabela nova (aditiva):**

```sql
CREATE TABLE IF NOT EXISTS shift_closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_date TEXT NOT NULL,          -- dia local YYYY-MM-DD do INÍCIO do turno
  shift_type TEXT NOT NULL CHECK(shift_type IN ('DIURNO','NOTURNO')),
  start_iso TEXT NOT NULL,           -- início do turno (ISO UTC)
  end_iso TEXT NOT NULL,             -- fim do turno (ISO UTC)
  total_avulsos REAL NOT NULL,
  total_renovacoes REAL NOT NULL,
  count_avulsos INTEGER NOT NULL,
  count_renovacoes INTEGER NOT NULL, -- vendas (is_advance = 0)
  by_method_json TEXT NOT NULL,      -- {"Dinheiro": 268, "Pix": 254, ...}
  cash_counted REAL,                 -- dinheiro contado na gaveta (conferência)
  cash_difference REAL,              -- contado - esperado em dinheiro
  operator_name TEXT,
  closed_at TEXT NOT NULL,
  UNIQUE(shift_date, shift_type)     -- um fechamento por turno; imutável
)
```

**Regras:**
- Turnos padrão 07:00–19:00 (diurno) e 19:00–07:00 (noturno, cruza a meia-noite como unidade). Horários no `config.ts` (padrão fixo, editável em Configurações numa iteração futura).
- Totais do turno = mesmas queries por intervalo da Fase 1/2, com `start_iso`/`end_iso` do turno.
- Fechamento é **INSERT imutável** (sem handler de UPDATE; re-fechar o mesmo turno é bloqueado pela UNIQUE — resolve a causa nº 4: transações lançadas depois entram no turno seguinte, o registro fechado nunca muda).
- `logSync('shift_closures', id, 'INSERT', ...)` para a replicação LAN.
- Impressão do fechamento reutiliza o `printer.ts` (mesmo padrão do recibo).

**UI (mockup aprovado na análise):** nova aba "Fechamento de caixa" na sidebar —
badge do turno atual + contagem regressiva, cards (avulsos / renovações / total),
quebra por forma de pagamento, conferência de gaveta com diferença,
botão vermelho "Fechar turno" (confirmação obrigatória), tabela de transações do turno,
histórico de fechamentos com status. Padrão visual: `bg-gray-900`, cards `bg-gray-800 border-gray-700`,
acento `red-600`, valores em `green-500`.

**Relatório do dia atual:** permanece intacto nesta fase (os gerentes decidem depois se ele
sai ou vira "consolidado do dia" = soma dos dois turnos).

**Risco ao pátio:** nenhum (tabela nova + leituras novas + uma tela nova).

---

## Ordem, commits e critério de "pronto"

| # | Fase | Commit(s) | Gate antes do próximo |
|---|---|---|---|
| 1 | Fuso nas agregações | `fix(finance): agregações por intervalo local` ✅ (573ccbb) | `npm test` verde + UAT saída 22h |
| 2 | Fuso operacional (1b) | `fix: getPlateWasInToday e devedor por dia local` | UAT entrada repetida + badge devedor |
| 3 | Status vs vencimento (1c) | `fix(mensalistas): em dia se vencimento cobre hoje` | UAT caso do vídeo (pago ≠ atraso) |
| 4 | Totais sem LIMIT | `fix(finance): totais mensais via SQL sem limite` | Financeiro = CSV = soma manual |
| 5 | Renovação clara | `fix(renovar): valor por mês explícito + contagem por venda` | UAT renovação 3 meses |
| 6 | Pagamento no avulso | `feat(checkout): forma de pagamento` | Checklist pátio completo |
| 7 | Turnos | `feat(caixa): fechamento por turno de 12h` | UAT fechamento diurno + noturno |

Nota de priorização (09/07): o vídeo do funcionário subiu a urgência de **1c** (está gerando
quebra de caixa e cobrança indevida hoje) e confirmou **7** como o pedido da operação.
A ordem técnica acima mantém as correções de base antes da feature nova.

Cada fase é um commit atômico e reversível sozinho. Nenhuma fase depende da posterior.

## Rede de regressão do pátio (rodar ao fim de CADA fase)

1. `npm test` (calculations + garageDates intactos).
2. Entrada avulso (carro e moto) → aparece no pátio.
3. Saída dentro da cota grátis → R$ 0.
4. Saída com cobrança → mesmo valor de antes (casos do `calculations.test.ts` manualmente: 2h ⇒ R$ 4/h além da cota).
5. Pernoite (entrada 18h+, saída antes de 8h) → R$ 50.
6. Re-entrada no mesmo dia → cota diária descontada (anti-fraude).
7. Mensalista e garagem: entrada/saída sem cobrança.
8. Excluir veículo com senha `161021`.
9. Impressão de ticket de entrada e recibo de saída.

## Itens fora de escopo (registrados, não esquecidos)

- Migração/normalização de datas antigas no banco: **não fazer** — leitura por intervalo resolve sem tocar dados.
- Editar horários de turno pela UI de Configurações: iteração futura.
- Unificar Relatório do dia com turnos: decisão dos gerentes após uso.
- Auditoria de renovações multi-meses antigas: tarefa manual única (Fase 3 gera a listagem).
