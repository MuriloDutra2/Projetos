# KF Estacionamento

Sistema de controle de estacionamento para entrada/saída de veículos, mensalistas e financeiro. Desenvolvido com Electron + React + TypeScript + SQLite.

## O que é

O **KF Estacionamento** permite:

- **Entrada de veículos**: Registro por placa e tipo (carro/moto), com detecção automática de mensalistas
- **Saída e cobrança**: Cálculo de valor conforme tempo e tipo (avulso ou mensalista com franquia)
- **Mensalistas**: Cadastro de clientes com planos (Mensal Carro, Mensal Moto, Funcionário), renovações e edição
- **Financeiro**: Totais por mês (avulsos e renovações), filtro por período, exportação CSV
- **Impressão**: Tickets de entrada/saída e recibos de mensalista em impressora térmica 80mm

## Requisitos

- **Node.js** 18+
- **Impressora térmica** 80mm (recomendado para tickets)
- **Windows**, **macOS** ou **Linux**

## Como rodar

### Instalação

```bash
npm install
```

### Desenvolvimento

```bash
npm run dev
```

### Gerar executável

**Windows:**
```bash
npm run build:win
```

**macOS:**
```bash
npm run build:mac
```

**Linux:**
```bash
npm run build:linux
```

O instalador/arquivo gerado ficará em `dist/`.

## Estrutura do projeto

```
├── src/
│   ├── main/           # Processo principal (Electron)
│   │   ├── index.ts    # IPC handlers, janela
│   │   ├── db.ts       # SQLite, operações de banco
│   │   ├── printer.ts  # Impressão térmica
│   │   ├── config.ts   # Configurações (ex.: impressora)
│   │   └── calculations.ts
│   ├── preload/        # Preload scripts, API exposta
│   └── renderer/       # Frontend React
│       └── src/
│           ├── App.tsx
│           ├── components/
│           └── utils/
├── resources/          # Ícones
├── parking.db          # Banco SQLite (desenvolvimento)
└── electron-builder.yml
```

## Banco de dados

O SQLite (`parking.db`) armazena:

- `tickets` – entradas/saídas de veículos
- `clients` – mensalistas
- `client_vehicles` – placas dos clientes
- `subscription_payments` – histórico de renovações

## Configuração

- **Impressora**: Em *Configurações* (ícone de engrenagem), escolha a impressora térmica desejada. Se não configurar, será usada a impressora padrão do sistema.
