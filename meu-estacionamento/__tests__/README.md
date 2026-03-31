# Estrutura de testes – Meu Estacionamento

## Estrutura de pastas

```
__tests__/
├── README.md              ← Este arquivo (estrutura e como ativar)
├── CASOS-DE-TESTE.md      ← Todos os casos por categoria com resultado esperado
├── fixtures/              ← Dados de teste (JSON/TS) para cenários
│   └── (opcional: cenarios-cobranca.json, etc.)
├── unit/                  ← Testes unitários (sem DB, sem Electron)
│   └── calculations.test.ts
└── integration/           ← Testes de integração (DB em memória/temporário)
    └── (db.test.ts quando o módulo permitir rodar sem Electron)
```

---

## Como ativar

1. **Instalar dependências** (já inclui Vitest):
   ```bash
   npm install
   ```

2. **Rodar os testes:**
   ```bash
   npm run test
   ```
   Todos os testes unitários de cobrança e pernoite rodam e o resultado aparece no terminal (quantos passaram/falharam e, em caso de falha, o valor esperado vs obtido).

3. **Gerar relatório em arquivo (antes de produção):**
   ```bash
   npm run test:report
   ```
   Gera o arquivo `test-results.json` na raiz do projeto com o resultado de cada teste. Se algum teste falhar, esse JSON traz o detalhe (esperado vs obtido) para você conferir antes de lançar em produção.

4. **Rodar de madrugada (agendado):**
   - **Windows:** Abra o Agendador de Tarefas, crie uma tarefa que execute no horário desejado (ex.: 03:00). Programa: `npm`, argumentos: `run test:report`, iniciar em: pasta do projeto (ex.: `C:\...\meu-estacionamento`).
   - **Linux/macOS:** No cron, adicione por exemplo: `0 3 * * * cd /caminho/meu-estacionamento && npm run test:report`.

5. **Antes de cada deploy:** Rode `npm run test` (ou `npm run test:report`) e só faça o deploy se todos os testes passarem. Se falhar, use o relatório ou o terminal para ver o que estava **esperado** e o que foi **obtido**.

---

## Como rodar (resumo)

### Comandos

| Comando | Descrição |
|---------|------------|
| `npm run test` | Roda todos os testes (unitários) e mostra resultado no terminal |
| `npm run test:report` | Roda os testes e gera `test-results.json` na raiz com resultado e esperado vs obtido nas falhas |

## O que está coberto hoje

- **Unitários:** `calculations.ts` (`calcularValor`, `isPernoite`, `minutosDaEstadia`) e `translateDbError` de `db.ts`. Rodam com `npm run test`.
- **Integração:** Os casos estão listados em `CASOS-DE-TESTE.md`. Para rodá-los automaticamente é necessário usar um banco de teste (em memória ou arquivo temporário); o módulo `db` atual depende do Electron, então os testes de integração podem exigir um helper que crie o schema em um DB separado para testes.

## Referência de casos

Veja **CASOS-DE-TESTE.md** para a lista completa de casos por categoria e resultado esperado de cada um.
