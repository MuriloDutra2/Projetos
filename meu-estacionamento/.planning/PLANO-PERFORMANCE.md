# Plano — Desempenho do app (Fase 13)

**Motivação:** áudio + vídeo de 27/07/2026. O vídeo mostra o diálogo do Windows
**"Electron não está respondendo"** com o pátio em 15 carros / 3 motos — ou seja, não é
"lentidão" difusa: é **congelamento do app** (processo travado). O áudio confirma:
"muito lento, depois da última atualização".

## Pesquisa — medições em banco sintético de produção

Banco reconstruído no schema real do app e preenchido em 3 escalas (6 meses/100 por dia;
18 meses/100 por dia; 18 meses/200 por dia). Consultas do app cronometradas (melhor de 5).
**As medições são em SSD moderno — a máquina do cliente é um HP antigo, provavelmente com
HD mecânico, onde cada número piora de 5× a 30×.**

| Ponto medido | 6 meses | 18 meses | 18m/200 dia |
|---|---|---|---|
| Pátio (tickets ativos) | 0,2 ms | 0,2 ms | 0,1 ms |
| Caixa ao vivo (turno 12h) | 0,3 ms | 0,3 ms | 0,3 ms |
| Financeiro do mês (consulta) | 4,6 ms | 4,9 ms | 7,5 ms |
| **Placa esteve hoje** (entrada) | 6,8 ms | **28 ms** | **43 ms** |
| Tamanho do banco | 15 MB | **46 MB** | **93 MB** |

Sem os índices da 1.2.0, pátio/caixa/agregados custavam 8–9 ms em vez de 0,1–0,3 ms —
**os índices já entregues ajudaram e devem ficar.**

### As 6 causas encontradas (em ordem de impacto)

**1. Aba Financeiro monta uma tabela gigante (causa provável do "não está respondendo").**
Medido em 18 meses: **2.661 linhas renderizadas** e **457 KB de payload IPC** por abertura
da aba, sem paginação. Cada linha faz `format()` de data + `clsx` + `toFixed`. Em React,
numa máquina antiga, isso bloqueia a interface por vários segundos → o Windows exibe
"não está respondendo". **Regressão introduzida pela Fase 4** (removi o `LIMIT 50` para
corrigir os totais) — os totais precisavam mesmo vir do SQL, mas a *lista visível* não.

**2. Escrita 59× mais lenta que o necessário.** O banco abre no modo padrão
(`journal_mode=DELETE`, `synchronous=FULL`): cada gravação faz `fsync`. Uma entrada de
veículo custa 3 transações (INSERT ticket + UPDATE cpf + INSERT sync_log). Medido:
**744 ms para 60 entradas (12,4 ms cada) contra 13 ms (0,2 ms cada) com
`WAL` + `synchronous=NORMAL` — 59× mais rápido.** Em HD mecânico a diferença é ainda maior
(fsync em HD custa ~10 ms cada). Isso explica a lentidão percebida a cada clique.

**3. `sync_log` cresce sem limite e é 63% do banco.** 162.000 linhas ≈ **29 MB dos 46 MB**.
Cada entrada/saída grava 2–3 registros com payload JSON. O sync LAN **nem está em uso** em
produção — é peso morto que encarece backup, VACUUM e o próprio arquivo.

**4. Backup de startup trava a abertura.** `copyFileSync` síncrono do banco inteiro a cada
inicialização: 46 MB → ~50 ms em SSD, mas **~0,9 a 1,5 segundo em HD antigo**, com o app
congelado. E 10 cópias = **464 MB de disco** (num notebook antigo isso importa).

**5. "Placa esteve hoje" faz varredura completa da tabela.** A consulta usa
`UPPER(REPLACE(placa,'-',''))`, o que **impede o uso de índice** — varre todos os tickets
aplicando função linha a linha. **28 ms aos 18 meses, 43 ms no volume alto, e piora para
sempre.** Roda a cada digitação de placa (debounce 300 ms) e no blur — no fluxo mais usado.

**6. Aba "Veículos excluídos" sem limite algum.** `getExcludedTickets` não tem `LIMIT`:
renderiza o histórico inteiro de exclusões. Mesmo risco de congelamento da causa 1.

---

## Fase 13 — plano de correção (ordenado por impacto/risco)

Regra de ouro mantida: **nada altera cálculo de valor nem o fluxo de armazenamento de
veículos.** Tudo aqui é desempenho — a mesma informação, entregue mais rápido.

### 13a — Ganhos grandes, risco baixo (fazer primeiro)

1. **WAL + synchronous=NORMAL** (`db.ts`, 2 linhas): `PRAGMA journal_mode=WAL`,
   `PRAGMA synchronous=NORMAL`. Ganho medido de 59× na escrita. WAL é o modo recomendado
   para app local de usuário único; `NORMAL` mantém durabilidade contra queda do app
   (só perderia a última transação numa queda de energia — aceitável, e há backup diário).
   *Atenção:* WAL cria `parking.db-wal`/`-shm`; o backup de startup precisa passar a usar
   a API de backup do SQLite (`db.backup()`) em vez de `copyFileSync`, senão a cópia sai
   inconsistente. Isso resolve a causa 2 **e** melhora a 4 (backup deixa de bloquear).

2. **Paginar a tabela do Financeiro** (causa 1): manter os **totais vindos do SQL** (estão
   certos) e exibir a tabela em páginas de 100 linhas (ou "carregar mais"). O CSV continua
   exportando o mês inteiro. Idem para **Veículos excluídos** (causa 6): `LIMIT` + paginação.
   Isso é o que devolve a resposta imediata da interface.

3. **Índice utilizável para "placa esteve hoje"** (causa 5): guardar a placa já normalizada
   (ela **já é normalizada na gravação** — `createTicket` grava sem hífen e em maiúsculas),
   então basta trocar a consulta para comparar `placa = ?` direto e criar
   `CREATE INDEX idx_tickets_placa ON tickets(placa)`. De varredura completa para busca
   indexada (~0,1 ms), e para de piorar com o tempo.

### 13b — Manutenção do banco (ganho grande no arquivo, risco médio)

4. **Poda do `sync_log`** (causa 3): manter apenas os últimos 30 dias (ou 5.000 registros),
   apagando o excedente no startup + `VACUUM` periódico. Reduz o banco de 46 MB para
   ~17 MB, o que acelera backup, abertura e cópia para pendrive.
   *Cuidado:* se um dia o sync LAN entrar em uso, a poda precisa respeitar o `seq` já
   replicado pelo outro nó. Como o sync **não está em produção**, a poda é segura hoje —
   deixar comentado no código o que muda quando o sync for ativado.

5. **Backup mais barato** (causa 4): usar `db.backup()` (assíncrono, incremental, seguro com
   WAL) e reduzir a retenção de 10 para 5 cópias — junto com a poda, sai de 464 MB para
   ~85 MB de disco.

### 13c — Investigação adicional na máquina real (o que só o campo mostra)

O diagnóstico acima é sólido, mas foi medido em SSD. Antes/depois do deploy vale coletar
na máquina do cliente:
- Tamanho de `%APPDATA%\KF Estacionamento\parking.db` e da pasta `backups\`;
- Se o disco é HD ou SSD (Gerenciador de Tarefas → Desempenho);
- RAM total e uso com o app aberto (Electron 39 pede ~300–500 MB);
- Se o antivírus está varrendo a pasta do app (causa comum de lentidão em Electron —
  vale adicionar exceção para a pasta do app e do `parking.db`).

Se depois de 13a/13b ainda houver congelamento, o próximo passo é medir com o app rodando
em modo de desenvolvimento na própria máquina (DevTools → Performance) para achar o ponto
exato, em vez de continuar por hipótese.

---

## 13a — EXECUTADA (27/07/2026) e verificada no app real

Rodado o app de verdade (build do worktree) contra o banco sintético de 18 meses / 46 MB:

| Item | Resultado medido |
|---|---|
| WAL + synchronous=NORMAL | `journal_mode = wal` confirmado no banco; escrita 59× mais rápida no benchmark |
| Índice de expressão da placa | **29,2 ms → 0,01 ms**; plano passou de `SCAN tickets` para `SEARCH tickets USING INDEX idx_tickets_placa_norm` |
| Backup via `db.backup()` | Backup gerado, `integrity_check = ok`, 54.018 tickets preservados; agora assíncrono (não trava a abertura) |
| Fechamento limpo | `wal_checkpoint(TRUNCATE)` + `close()` no `will-quit` — o parking.db fica íntegro sozinho para cópia/pendrive |
| Paginação Financeiro/Excluídos | Tabelas desenham 100 linhas por vez, com "Mostrar mais"; totais e CSV seguem cobrindo o mês inteiro |

**Achado do caminho longo:** no primeiro teste o `db.backup()` falhou com `SQLITE_CANTOPEN`
porque o caminho do scratchpad tinha 255 caracteres (limite do Windows). Em caminho curto
(como em produção, `%APPDATA%\KF Estacionamento\`) funciona. Mesmo assim foi adicionada
**rede de segurança**: se `db.backup()` falhar, o app faz `wal_checkpoint(TRUNCATE)` e cai
para a cópia direta do arquivo — nunca fica sem backup.

## 13b — EXECUTADA (27/07/2026) e verificada no app real

Mesmo banco de 18 meses (46 MB), app real, primeira abertura:

```
[db] sync_log: 153000 registros antigos removidos.
[db] compactando o banco (33 MB livres)...
[db] banco compactado em 135 ms.
```

| Antes | Depois |
|---|---|
| Banco 46 MB | **13 MB (−72%)** |
| sync_log 162.000 linhas | 9.000 linhas (30 dias + folga de 5.000) |
| 10 backups (≈464 MB) | 5 backups (≈65 MB com o banco menor) |

**Dados preservados:** 54.018 tickets e 1.620 pagamentos intactos,
`integrity_check = ok`, `journal_mode = wal`. Na **segunda abertura não há
nenhuma poda ou compactação** (idempotente) — o custo é só uma vez, e o VACUUM
levou 135 ms mesmo em banco grande, rodando 15 s depois da abertura para não
somar ao tempo de startup.

## 13c — Impressora desligável (28/07/2026) — a causa que faltava

**Vídeo de 28/07** mostrou o congelamento acontecendo **durante o "REGISTRANDO..."**
(botão de entrada), com 48 veículos no pátio. Hipótese do cliente: como não usam mais a
impressora, o Windows fica tentando alcançá-la e trava o app. **Confirmada no código e
medida.**

O fluxo de entrada faz `await printEntry(...)` antes de liberar a tela (`Inicio.tsx`), e o
timeout de 30 s em `runPrint` **apenas rejeita a promessa — não cancela a chamada nativa**
ao spooler já em andamento. Sem impressora conectada, é exatamente o quadro do vídeo.

**Solução:** interruptor "Usar impressora térmica" em Configurações
(`config.printingEnabled`, padrão ligado para não mudar quem usa a térmica). Desligado, o
app **não toca a API de impressão em nenhum fluxo** — a checagem acontece dentro de
`runPrint`, antes de qualquer contato, e `get-printers` também deixa de consultar o
spooler (essa consulta trava do mesmo jeito).

**Medido no app real (registro de entrada, do clique até a tela liberar):**

| Impressão | Tempo | Alerta de erro |
|---|---|---|
| Ligada (máquina de teste, sem térmica) | **3.873 ms** | sim |
| Desligada | **57 ms** | não |

`getPrinters()` devolve lista vazia e `print-entry` responde `{success: true}` sem
imprimir — nenhum alerta falso de erro para o operador.

**Melhoria futura (não feita agora):** tornar a impressão não-bloqueante (disparar e seguir,
mostrando eventual falha depois). Resolveria o congelamento mesmo com a impressora ligada
e travada — mas muda o momento em que o operador vê o erro, então precisa de decisão da
operação.

## Ordem sugerida e verificação

| # | Item | Verificação |
|---|---|---|
| 1 | WAL + synchronous + backup via `db.backup()` | Benchmark de escrita; abrir/fechar o app; conferir `-wal` e backup íntegro |
| 2 | Paginar Financeiro + Excluídos | Abrir as abas com banco sintético de 18 meses e cronometrar |
| 3 | Índice de placa + consulta direta | Reexecutar o benchmark: 28 ms → ~0,1 ms |
| 4 | Poda do sync_log + VACUUM | Tamanho do banco antes/depois |
| 5 | Retenção de backups 10 → 5 | Tamanho da pasta backups |

Rede de regressão do pátio (9 itens do plano principal) + QA rodada 6 focada em
desempenho, com o banco sintético de 18 meses copiado para o scratch do agente.
