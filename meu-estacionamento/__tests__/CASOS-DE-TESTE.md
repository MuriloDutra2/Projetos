# Casos de teste do sistema – por categoria e resultado esperado

Este documento lista todos os casos de teste possíveis, separados por categoria, com o **resultado esperado** de cada um. Use como referência para implementar os testes e para validar antes de lançar em produção.

---

## 1. Cálculo de valor (`calculations.ts` – `calcularValor`)

Regras: avulso 90 min grátis por estadia (meia-noite NÃO renova a cota — Fase 8, aprovada em 09/07/2026); mensalista 150 min grátis; R$ 4,00 por hora ou fração; `dailyUsedMinutes` (uso do dia da entrada) reduz o tempo grátis.

**Decisão da gerência (10/07/2026): não existe mais a categoria "pernoite" na operação.** O avulso que passa a noite paga tarifa horária normal (ex.: 19h→7h = 720 min − 90 grátis = R$ 44). No código, a regra legada de R$ 50 fixo (`isPernoite`) só dispara para estadias **acima de 24 horas** com entrada 18h–23:59 e saída 00h–08h — mantida por compatibilidade.

| # | Descrição | Entrada (ISO) | Saída (ISO) | freeMinutes | dailyUsed | aplicarPernoite | Resultado esperado |
|---|-----------|---------------|-------------|-------------|-----------|-----------------|--------------------|
| 1.1 | Dentro do grátis avulso (90 min) | 10:00 | 11:29 | 90 | 0 | false | 0 |
| 1.2 | Exatamente 90 min avulso | 10:00 | 11:30 | 90 | 0 | false | 0 |
| 1.3 | 1 minuto além do grátis avulso (1 fração = 1h) | 10:00 | 11:31 | 90 | 0 | false | 4 |
| 1.4 | 1h31 total avulso | 10:00 | 11:31 | 90 | 0 | false | 4 |
| 1.5 | 2 horas além do grátis | 10:00 | 13:30 | 90 | 0 | false | 8 |
| 1.6 | 1h01 de excedente (fração conta como 1h) | 10:00 | 12:01 | 90 | 0 | false | 8 |
| 1.7 | Mensalista dentro do grátis (150 min) | 10:00 | 12:29 | 150 | 0 | false | 0 |
| 1.8 | Mensalista exatamente 2h30 | 10:00 | 12:30 | 150 | 0 | false | 0 |
| 1.9 | Mensalista 1 min além (2h31) | 10:00 | 12:31 | 150 | 0 | false | 4 |
| 1.10 | Uso diário consumido parcialmente (60 min já usados) | 10:00 | 12:00 | 90 | 60 | false | 4 |
| 1.11 | Uso diário consumido todo (90 min já usados) | 10:00 | 11:00 | 90 | 90 | false | 4 |
| 1.12 | Pernoite legado (estadia > 24h): entrada 19h dia 1, saída 07h dia 3 | 19:00 dia 1 | 07:00 dia 3 | 90 | 0 | true | 50 |
| 1.13 | Noite comum (19h→7h) cobra tarifa horária — cota única | 19:00 dia 1 | 07:00 dia 2 | 90 | 0 | false | 44 |
| 1.14 | Mesmo dia (não é pernoite) | 10:00 | 18:00 | 90 | 0 | true | 32 (8h excedente) |
| 1.15 | Funcionário (720 min grátis) 10h de estadia | 08:00 | 18:00 | 720 | 0 | false | 0 |
| 1.16 | Garagem (999999 min) | 08:00 | 20:00 | 999999 | 0 | false | 0 |
| 1.17 | Zero minutos grátis (tudo pago) 1h | 10:00 | 11:00 | 0 | 0 | false | 4 |
| 1.18 | effectiveFree negativo tratado (dailyUsed > free) | 10:00 | 11:00 | 90 | 100 | false | 4 |

---

## 2. Pernoite (`calculations.ts` – `isPernoite`)

Regra legada (mantida por compatibilidade): entrada entre 18h e 23:59, saída entre 00h e 08h **e estadia acima de 24 horas** (`diffDias >= 1`). A noite comum (19h→7h, 12h de estadia) NÃO é pernoite — paga tarifa horária (decisão da gerência, 10/07/2026).

| # | Descrição | Entrada | Saída | Resultado esperado |
|---|-----------|---------|-------|--------------------|
| 2.1 | Entrada 18h, saída 07h com estadia > 24h | 18:00 dia 1 | 07:00 dia 3 | true |
| 2.2 | Entrada 19h, saída 08h com estadia > 24h | 19:00 dia 1 | 08:00 dia 3 | true |
| 2.3 | Noite comum (12h de estadia) | 19:00 dia 1 | 07:00 dia 2 | false |
| 2.4 | Saída 09h (fora da janela 00h–08h) | 19:00 dia 1 | 09:00 dia 2 | false |
| 2.5 | Entrada 17h (antes de 18h) | 17:00 dia 1 | 02:00 dia 2 | false |
| 2.6 | Mesmo dia (sem passar meia-noite) | 10:00 | 20:00 | false |
| 2.7 | saída <= entrada | 20:00 dia 1 | 19:00 dia 1 | false |

---

## 3. Minutos da estadia (`calculations.ts` – `minutosDaEstadia`)

| # | Descrição | Entrada | Saída | Resultado esperado |
|---|-----------|---------|-------|--------------------|
| 3.1 | 60 min | 10:00 | 11:00 | 60 |
| 3.2 | 91 min | 10:00 | 11:31 | 91 |
| 3.3 | 0 min (mesmo instante) | 10:00 | 10:00 | 0 |

---

## 4. Tradução de erro de banco (`db.ts` – `translateDbError`)

| # | Descrição | Entrada (error) | Resultado esperado |
|---|-----------|------------------|--------------------|
| 4.1 | SQLITE_CONSTRAINT | { code: 'SQLITE_CONSTRAINT' } | "Esta placa já está cadastrada no sistema." |
| 4.2 | UNIQUE constraint na mensagem | { message: 'UNIQUE constraint failed: ...' } | "Esta placa já está cadastrada no sistema." |
| 4.3 | Outro erro | { message: 'Outro erro' } | "Outro erro" |
| 4.4 | Erro sem mensagem | {} | "Erro desconhecido ao salvar." |

---

## 5. Tickets (integração com DB)

Requer banco em memória ou temporário; placa normalizada (só A-Z0-9, maiúsculo).

| # | Descrição | Ação | Resultado esperado |
|---|-----------|------|--------------------|
| 5.1 | Criar ticket ativo | createTicket('ABC1234', 'Carro', entrada) | Retorna id; ticket com status ATIVO existe |
| 5.2 | Dois tickets mesma placa (ativo) | createTicket duas vezes mesma placa | Segundo falha ou regra: "já no pátio" (validado no main) |
| 5.3 | Checkout atualiza status e valor | checkoutTicket(id, 4, saida) | status FINALIZADO, saida e valor preenchidos |
| 5.4 | Excluir ticket | excludeTicket(id) | status EXCLUIDO, valor 0, saida preenchida |
| 5.5 | Excluir todos ativos | excludeAllActiveTickets() | Nenhum ticket com status ATIVO restante |
| 5.6 | getHistoryForDay | Inserir 2 finalizados no dia X, 1 em outro dia | getHistoryForDay(X) retorna 2 registros |
| 5.7 | getHistoryLast24h | Inserir finalizado com saida há 23h | Retorna esse registro; saida há 25h não retorna |
| 5.8 | hasActiveTicket | Placa com ticket ATIVO | true; placa sem ativo false |
| 5.9 | getPlateWasInToday | Ticket com entrada ou saída no dia D | getPlateWasInToday(placa, D) true |

---

## 6. Mensalistas / clientes (integração com DB)

| # | Descrição | Ação | Resultado esperado |
|---|-----------|------|--------------------|
| 6.1 | Criar cliente com uma placa | createClient({ name, plan_type MENSAL_CARRO, expiry_date YYYY-MM-DD, plates: ['ABC1234'] }) | client_id; client_vehicles tem 1 linha com plate normalizada |
| 6.2 | Criar cliente com duas placas | createClient com plates ['ABC1234','XYZ9876'] | 2 linhas em client_vehicles |
| 6.3 | getClients retorna placas e status | Após criar cliente ativo com vencimento futuro | status 'Ativo'; plates array com as placas |
| 6.4 | getClients vencido | expiry_date no passado (YYYY-MM-DD) | isExpired true, status 'Vencido' |
| 6.5 | getVehicleSubscription encontra placa | Placa cadastrada em client_vehicles | freeMinutes 150 (se MENSAL), clientName, isExpired conforme expiry |
| 6.6 | getVehicleSubscription placa inexistente | Placa nunca cadastrada | null |
| 6.7 | getVehicleSubscription FUNCIONARIO | plan_type FUNCIONARIO | freeMinutes 720 |
| 6.8 | getVehicleSubscription GARAGEM | plan_type GARAGEM | freeMinutes 999999 |
| 6.9 | updateClient altera nome e placas | updateClient com novo nome e nova lista de placas | clients e client_vehicles atualizados; placas antigas removidas |
| 6.10 | Placa duplicada em outro cliente | insertClientVehicle com placa já existente | Erro (UNIQUE); translateDbError retorna mensagem amigável |
| 6.11 | renewSubscription | renewSubscription(clientId, planType, amount) | expiry_date do cliente +30 dias (YYYY-MM-DD); subscription_payments com 1 registro |
| 6.12 | updateClientActive(0) | Cliente ativo → active 0 | getVehicleSubscription considera active; isExpired ou inativo |

---

## 7. Uso diário grátis (integração com DB)

| # | Descrição | Ação | Resultado esperado |
|---|-----------|------|--------------------|
| 7.1 | getDailyUsedMinutes sem uso | getDailyUsedMinutes(placa, data) | 0 |
| 7.2 | addDailyUsedMinutes depois get | addDailyUsedMinutes(placa, data, 60); getDailyUsedMinutes(placa, data) | 60 |
| 7.3 | Duas adições mesmo dia mesma placa | add 30, add 20 | get retorna 50 (upsert soma) |

---

## 8. Relatório do dia (integração com DB)

| # | Descrição | Ação | Resultado esperado |
|---|-----------|------|--------------------|
| 8.1 | getDailyReport dia sem dados | getDailyReport(dateStr) | totalAvulsos 0, planosVendidosCount 0, saved null |
| 8.2 | getTotalAvulsosForDay / getPlanosVendidosForDay | Tickets finalizados e pagamentos no dia | totalAvulsos soma dos valores; planos count e total corretos |
| 8.3 | saveDailyReport depois get | saveDailyReport(dateStr, data); getDailyReport(dateStr) | saved com qtyCars, qtyMotos, createdAt |

---

## 9. Financeiro (integração com DB)

| # | Descrição | Ação | Resultado esperado |
|---|-----------|------|--------------------|
| 9.1 | getFinancialHistory | Inserir subscription_payments | Retorna lista ordenada por payment_date DESC |
| 9.2 | getAllFinishedForFinance | Tickets FINALIZADO | Até 200 registros com source 'ticket' |

---

## Resumo por categoria

| Categoria | Arquivo / módulo | Tipo sugerido | Quantidade de casos |
|-----------|------------------|---------------|--------------------|
| Cálculo de valor | calculations.ts | Unitário | 18 |
| Pernoite | calculations.ts | Unitário | 7 |
| Minutos estadia | calculations.ts | Unitário | 3 |
| Tradução erro | db.ts | Unitário | 4 |
| Tickets | db.ts + main | Integração | 9 |
| Mensalistas | db.ts | Integração | 12 |
| Uso diário | db.ts | Integração | 3 |
| Relatório dia | db.ts | Integração | 3 |
| Financeiro | db.ts | Integração | 2 |

Os testes **unitários** (categorias 1–4) rodam sem Electron nem banco real. Os **integração** (5–9) precisam de um DB de teste (em memória ou arquivo temporário) e, se o módulo `db` depender do `app` do Electron, de um mock ou de um módulo de DB separado para testes.
