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
