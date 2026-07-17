# Testes antes de passar o instalador para o pendrive

## O que levar no pendrive

**Sim: apenas o arquivo .exe do instalador.**

- Caminho após o build: `dist\meu-estacionamento-1.0.0-setup.exe` (o número da versão pode variar conforme o `package.json`).
- Copie **só esse arquivo** para o pendrive. No outro PC, o usuário executa o .exe e instala normalmente; não é necessário copiar mais nada.

---

## Checklist de testes no seu PC (antes de considerar pronto)

### 1. Instalação
- [ ] Rodar o instalador (.exe) e concluir a instalação sem erros.
- [ ] Verificar se o atalho aparece no Menu Iniciar e/ou na Área de Trabalho (conforme configurado).
- [ ] Verificar se o ícone do app está correto no atalho (não o ícone padrão do Electron).

### 2. Primeira execução
- [ ] Abrir o app pelo atalho.
- [ ] Confirmar que a janela abre sem mensagem de erro (ex.: banco de dados).
- [ ] Verificar se o ícone na barra de tarefas e na janela está correto.

### 3. Funcionalidades principais
- [ ] **Entrada de veículo:** registrar uma placa (entrada) e conferir se o ticket é gerado.
- [ ] **Saída de veículo:** finalizar um ticket e conferir se o valor e a saída são salvos.
- [ ] **Assinantes:** cadastrar um assinante e um veículo; conferir se aparecem nas listagens.
- [ ] **Impressora (se usar):** configurar a impressora nas configurações e testar impressão de um ticket ou recibo.

### 3b. Financeiro (atualização jul/2026)
- [ ] **Saída paga:** escolher cada forma de pagamento (Dinheiro, Pix, Cartão) em saídas diferentes e conferir a forma na aba Financeiro.
- [ ] **Saída gratuita (dentro da cota):** conferir que NÃO aparece pergunta de forma de pagamento.
- [ ] **Excluir veículo (sem cobrança):** continua funcionando com a senha.
- [ ] **Renovação multi-meses:** renovar 3 meses e conferir o total exibido no modal, o recibo (total + meses) e "planos vendidos = 1" no Relatório do dia.
- [ ] **Mensalista pago:** cliente com vencimento futuro mostra "Em dia" e entra no pátio como MENSALISTA (caso do vídeo de 09/07).
- [ ] **Saída após 21h:** registrar uma saída depois das 21h e conferir que cai no dia certo no Relatório, Financeiro e Histórico.
- [ ] **Total do mês:** conferir que o total de avulsos do Financeiro bate com a soma da tabela e com o CSV exportado.
- [ ] **Cota à meia-noite (Fase 8):** entrada 23h e saída 01:30 deve cobrar R$ 4 (a meia-noite não renova a cota; o vermelho do pátio agora coincide com a cobrança). Pernoite (18h+ → até 8h) continua R$ 50.
- [ ] **Cliente da madrugada (Fase 9 — caso dos vídeos de 15/07):** noite 1 passa da cota e paga o excedente; na noite 2, o MESMO veículo entra ~23h30 e fica menos de 1h30 → deve sair por R$ 0 (os minutos pagos da véspera não podem virar "cota consumida" do dia seguinte).

### 3c. Fechamento de caixa (atualização jul/2026)
- [ ] **Aba Caixa:** abrir a aba, conferir o aviso "Caixa aberto desde HH:mm", o badge do turno (diurno 07h–19h / noturno 19h–07h) e a contagem regressiva.
- [ ] **Totais ao vivo:** fazer uma saída paga e uma renovação; conferir que os cards e a quebra por forma atualizam (recarrega a cada 30s).
- [ ] **Conferência:** digitar o dinheiro contado e conferir sobra/falta contra o "dinheiro esperado".
- [ ] **Operador obrigatório:** tentar fechar sem preencher o operador → deve avisar "Operador obrigatório" e não fechar.
- [ ] **Fechar caixa:** com o operador preenchido, confirmar; o comprovante deve imprimir e o caixa aparecer no histórico.
- [ ] **Abrir novo caixa (mesmo turno):** após fechar, o aviso mostra um caixa novo aberto agora; fazer uma nova saída e fechar de novo ANTES da troca de turno — deve permitir e gerar um segundo registro no histórico.
- [ ] **Fechamento vazio bloqueado:** tentar fechar um caixa sem nenhum movimento e sem dinheiro contado → deve avisar "Não há movimento neste caixa para fechar".
- [ ] **Transação após fechar:** registrar uma saída depois do fechamento e conferir que ela entra no caixa novo (card "Desde HH:mm").
- [ ] **Turno noturno:** fechar um caixa de madrugada e conferir que a janela cobre desde as 19h de ontem (cruza a meia-noite inteiro).
- [ ] **Fechamento automático (Fase 10):** deixar o caixa aberto na virada do turno (07h/19h) com o app aberto → o sistema fecha sozinho; a linha aparece VERMELHA no histórico com "Fechado automaticamente pelo sistema — confirmar".
- [ ] **Confirmar caixa automático:** clicar em "Confirmar caixa" na linha vermelha → operador obrigatório, dinheiro contado opcional; após confirmar, a linha sai do vermelho e mostra "Automático · confirmado por X".
- [ ] **Catch-up:** fechar o app antes da virada e reabrir depois → o fechamento automático da virada perdida é criado no startup, com o corte na hora exata da virada.

### 4. Dados persistentes
- [ ] Fechar o app e abrir de novo: conferir se os tickets e assinantes continuam lá.
- [ ] (Opcional) Verificar em `%APPDATA%\KF Estacionamento\` se existem `parking.db` e `config.json`.

### 5. Desinstalação (opcional)
- [ ] Desinstalar pelo Painel de Controle / Configurações e instalar de novo para testar uma “instalação limpa” no mesmo PC.

---

## Depois dos testes

Se tudo estiver ok, copie **apenas o arquivo**  
`dist\meu-estacionamento-1.0.0-setup.exe`  
para o pendrive e use esse mesmo arquivo para instalar em outros computadores.
