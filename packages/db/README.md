# @schimidt-brain/db

**Persistência institucional** — Ledger, Replay e Audit para o Schimidt Brain.

Este pacote implementa a camada de acesso a dados (DAL) sobre PostgreSQL, fornecendo:

- **Ledger de eventos** — armazena todos os eventos estruturados do sistema (MCL, intents, PM decisions, EHM actions, state changes)
- **Audit logs** — registra mudanças de configuração e ações humanas/sistema
- **Replay days** — cache de dias disponíveis para replay e exportação

---

## Configuração

### Variável de ambiente

```bash
export DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"
```

O pacote usa `DATABASE_URL` para conectar ao PostgreSQL (Railway ou qualquer instância compatível).

### Instalação de dependências

```bash
cd packages/db
npm install
```

---

## Migrations

As migrations estão em `src/migrations/` e devem ser executadas em ordem via `psql`:

```bash
# Criar tabelas (ledger_events, audit_logs, replay_days)
psql $DATABASE_URL -f packages/db/src/migrations/0001_init.sql

# Criar índices de performance
psql $DATABASE_URL -f packages/db/src/migrations/0002_indexes.sql
```

Ou usando o script npm:

```bash
cd packages/db
npm run migrate
```

> **Nota:** Todas as migrations são idempotentes (`IF NOT EXISTS`). É seguro reexecutar.

---

## Tabelas

### 1. `ledger_events` — O coração do sistema

Armazena **todos** os eventos estruturados. O campo `payload` guarda o JSON completo conforme `@schimidt-brain/contracts` para replay fiel.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `event_id` | `UUID PK` | Identificador único (idempotência) |
| `correlation_id` | `UUID NOT NULL` | Cadeia de correlação |
| `timestamp` | `TIMESTAMPTZ NOT NULL` | Momento do evento (ISO 8601) |
| `severity` | `TEXT NOT NULL` | `INFO` \| `WARN` \| `ERROR` |
| `event_type` | `TEXT NOT NULL` | Ex: `MCL_SNAPSHOT`, `BRAIN_INTENT`, `PM_DECISION` |
| `component` | `TEXT NOT NULL` | `MCL` \| `PM` \| `A2` \| `B3` \| `C3` \| `D2` \| `EHM` \| `SYSTEM` |
| `symbol` | `TEXT NULL` | Símbolo do ativo |
| `brain_id` | `TEXT NULL` | Brain emissor |
| `reason_code` | `TEXT NULL` | Código de razão do catálogo central |
| `payload` | `JSONB NOT NULL` | Evento completo conforme contracts |

**Índices:** `timestamp DESC`, `correlation_id`, `(event_type, timestamp)`, `(symbol, timestamp)`, `(brain_id, timestamp)`, `(severity, timestamp)`, `(reason_code, timestamp)`, GIN em `payload`.

### 2. `audit_logs` — Auditoria de ações

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `audit_id` | `UUID PK` | Identificador único |
| `timestamp` | `TIMESTAMPTZ NOT NULL` | Momento da ação |
| `actor_user_id` | `TEXT NOT NULL` | Quem executou |
| `actor_role` | `TEXT NOT NULL` | Papel do ator |
| `action` | `TEXT NOT NULL` | Tipo de ação (CONFIG_CHANGE, BRAIN_TOGGLE, etc.) |
| `resource` | `TEXT NOT NULL` | Recurso afetado |
| `reason` | `TEXT NOT NULL` | Motivo humano |
| `before` | `JSONB NULL` | Estado anterior |
| `after` | `JSONB NULL` | Estado posterior |
| `correlation_id` | `UUID NULL` | Correlação opcional |

**Índices:** `timestamp DESC`, `(actor_user_id, timestamp)`, `(resource, timestamp)`.

### 3. `replay_days` — Dias disponíveis para replay

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `date` | `DATE PK` | Data do dia |
| `created_at` | `TIMESTAMPTZ NOT NULL` | Quando foi registrado |
| `status` | `TEXT NOT NULL` | `complete` \| `partial` |
| `summary` | `JSONB NULL` | PnL agregado, DD, alerts (preenchido pela API) |

**Índices:** PK + `(status, date DESC)`.

---

## Uso dos Repositórios

### Importação

```typescript
import {
  // Repos como namespace
  ledgerRepo,
  auditRepo,
  replayRepo,
  // Ou funções individuais
  insertEvent,
  insertEvents,
  listEventsByTimeRange,
  listEventsByCorrelationId,
  tailEvents,
  insertAuditLog,
  listAuditLogs,
  upsertReplayDay,
  listReplayDays,
  getReplayDay,
  // Queries especializadas
  searchLogs,
  listReplayDaysWithCounts,
  getReplayDayFull,
  // Connection
  getPool,
  closePool,
} from "@schimidt-brain/db";
```

### ledgerRepo — Eventos do sistema

```typescript
// Inserir um evento (idempotente por event_id)
const inserted = await insertEvent({
  event_id: "550e8400-e29b-41d4-a716-446655440000",
  correlation_id: "660e8400-e29b-41d4-a716-446655440000",
  timestamp: "2025-06-01T14:30:00Z",
  severity: "INFO",
  event_type: "MCL_SNAPSHOT",
  component: "MCL",
  symbol: "EURUSD",
  brain_id: null,
  reason_code: "MCL_STRUCTURE_CHANGE",
  payload: { /* JSON completo conforme MclSnapshotSchema */ },
});
// inserted === true (novo) ou false (já existia)

// Inserir batch (transação única, idempotente)
const count = await insertEvents([event1, event2, event3]);

// Listar por range temporal com filtros
const events = await listEventsByTimeRange(
  { start: "2025-06-01T00:00:00Z", end: "2025-06-01T23:59:59Z" },
  { symbol: "EURUSD", severity: "WARN" },
  100,  // limit
  0     // offset
);

// Listar por correlation_id (ordem cronológica)
const chain = await listEventsByCorrelationId("660e8400-...");

// Tail: últimos N eventos (para /decisions/live)
const latest = await tailEvents(50, { event_type: "PM_DECISION" });
```

### auditRepo — Auditoria

```typescript
// Inserir audit log
await insertAuditLog({
  audit_id: "770e8400-e29b-41d4-a716-446655440000",
  timestamp: "2025-06-01T14:35:00Z",
  actor_user_id: "admin@schimidt.com",
  actor_role: "admin",
  action: "CONFIG_CHANGE",
  resource: "config.risk_limits",
  reason: "Ajuste de limites para sessão de NY",
  before: { max_drawdown: 5 },
  after: { max_drawdown: 3 },
  correlation_id: null,
});

// Listar audit logs por range
const logs = await listAuditLogs(
  { start: "2025-06-01T00:00:00Z", end: "2025-06-01T23:59:59Z" },
  { resource: "config.risk_limits" }
);
```

### replayRepo — Replay de dias

```typescript
// Registrar/atualizar um dia de replay
await upsertReplayDay({
  date: "2025-06-01",
  status: "complete",
  summary: { pnl: 1250.50, max_dd: -2.3, alerts: 5 },
});

// Listar dias disponíveis
const days = await listReplayDays(90, "complete");

// Obter detalhe completo de um dia (eventos + audit logs)
const detail = await getReplayDay("2025-06-01");
// detail.events: LedgerEventRow[]
// detail.auditLogs: AuditLogRow[]
```

### Queries especializadas

```typescript
// Busca de logs (para /logs na UI)
const result = await searchLogs(
  "volatility spike",  // texto livre (busca no payload)
  { start: "2025-06-01T00:00:00Z", end: "2025-06-01T23:59:59Z" },
  { event_type: "MCL_SNAPSHOT", symbol: "EURUSD" },
  100,  // limit
  0     // offset
);
// result.rows, result.total, result.limit, result.offset

// Lista de dias com contagem de eventos (para UI calendário)
const daysWithCounts = await listReplayDaysWithCounts(90, "complete");
// daysWithCounts[0].event_count

// Detalhe completo com estatísticas
const full = await getReplayDayFull("2025-06-01");
// full.stats.total_events, full.stats.events_by_component, etc.
```

---

## Garantias

| Garantia | Implementação |
|----------|---------------|
| **Idempotência** | `ON CONFLICT (event_id) DO NOTHING` — inserir o mesmo evento duas vezes não duplica |
| **Timestamps** | Armazenados como `TIMESTAMPTZ` — timezone-aware, sem ambiguidade |
| **Replay fiel** | `payload JSONB` guarda o JSON completo conforme contracts — nenhuma informação é perdida |
| **Performance** | Índices otimizados para os padrões de acesso da UI (time range, correlation, filters) |
| **Transações** | Batch inserts usam transação única — tudo ou nada |

---

## Conexão e Shutdown

```typescript
import { getPool, closePool } from "@schimidt-brain/db";

// Pool é criado automaticamente na primeira chamada a getPool()
// Para shutdown graceful:
process.on("SIGTERM", async () => {
  await closePool();
  process.exit(0);
});
```

---

## Estrutura do pacote

```
packages/db/
  src/
    migrations/
      0001_init.sql          # Tabelas + constraints
      0002_indexes.sql        # Índices de performance
    schema/
      tables.ts               # Tipos TypeScript (rows, inputs, filters)
    repos/
      ledgerRepo.ts           # CRUD ledger_events
      auditRepo.ts            # CRUD audit_logs
      replayRepo.ts           # CRUD replay_days + getReplayDay
    queries/
      listReplayDays.ts       # Lista dias com contagem de eventos
      getReplayDay.ts         # Detalhe completo com estatísticas
      searchLogs.ts           # Busca de logs (texto + filtros)
    connection.ts             # Pool PostgreSQL (singleton)
    index.ts                  # Ponto de entrada único
  package.json
  tsconfig.json
  README.md
```
