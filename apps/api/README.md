# @schimidt-brain/api

**API Backend** — REST, SSE, Auth/RBAC, Decision Pipeline para o Schimidt Brain.

Este pacote implementa a camada de aplicação que costura `packages/contracts`, `packages/core` e `packages/db`, expondo:

- **REST API** para UI e operações
- **SSE** para eventos em tempo real
- **Auth + RBAC** (Admin / Operator / Viewer)
- **Pipeline de decisão** com Shadow Mode e Gate State (G0/G1/G2/G3)
- **Audit logs** em toda ação humana

---

## Configuração

### Variáveis de Ambiente

```bash
# Obrigatórias
export DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"
export API_KEY_ADMIN="your-admin-key"
export API_KEY_OPERATOR="your-operator-key"
export API_KEY_VIEWER="your-viewer-key"

# Opcionais
export PORT=3000                    # Default: 3000
export BUILD_VERSION="1.0.0"       # Default: 1.0.0-dev
export NODE_ENV="development"      # Default: development
```

### Instalação e Build

```bash
# Instalar dependências (a partir da raiz do repo)
cd packages/contracts && npm install && npx tsc
cd packages/core && npm install && npx tsc
cd packages/db && npm install && npx tsc
cd apps/api && npm install

# Build
cd apps/api
npm run build

# Rodar
npm start

# Ou dev mode
npm run dev
```

---

## Autenticação

Todas as rotas (exceto `/health`) requerem autenticação via API Key:

```
Authorization: Bearer <api_key>
```

### Roles e Permissões

| Role | Permissões |
|------|-----------|
| **Viewer** | GETs + SSE stream (leitura) |
| **Operator** | arm / disarm / kill / tick + tudo do Viewer |
| **Admin** | config changes + tudo do Operator |

---

## Endpoints

### 1. Health (público)

```bash
# Status do servidor
GET /health

# Response:
{
  "status": "OK",
  "version": "1.0.0-dev",
  "uptime_seconds": 120,
  "timestamp": "2025-06-01T14:30:00.000Z"
}
```

### 2. Operations

```bash
# Estado operacional completo
GET /ops/status
# Response: { gate, arm_state, global_mode, execution_state, provider_states, executor_connectivity }

# Armar sistema (Operator+)
POST /ops/arm
Body: { "confirm": "ARM" }

# Desarmar sistema (Operator+)
POST /ops/disarm
Body: { "confirm": "DISARM" }

# Kill switch: RISK_OFF + DISARM (Operator+)
POST /ops/kill
Body: { "confirm": "KILL" }

# Tick manual — executa 1 ciclo de decisão (Operator+)
POST /ops/tick
Body: { "symbols": ["EURUSD", "GBPUSD"] }
```

### 3. Config

```bash
# Ler config atual (Viewer+)
GET /config

# Atualizar config (Admin)
PUT /config
Body: {
  "reason": "Ajuste de limites para sessão de NY",
  "apply": "NEXT_WINDOW",
  "payload": {
    "gate": "G1",
    "risk_limits": { "max_drawdown_pct": 8 },
    "symbols": ["EURUSD", "GBPUSD", "USDJPY"]
  }
}
```

### 4. Decisions / Ledger

```bash
# Últimos N eventos (Viewer+)
GET /decisions/tail?limit=200&event_type=PM_DECISION&severity=WARN&symbol=EURUSD

# Trace por correlation_id (Viewer+)
GET /decisions/trace/:correlation_id
```

### 5. Replay

```bash
# Listar dias disponíveis (Viewer+)
GET /replay/days?limit=30&status=complete

# Detalhe completo de um dia (Viewer+)
GET /replay/2025-06-01

# Exportar JSON de um dia (Viewer+)
GET /replay/2025-06-01/export
```

### 6. Audit

```bash
# Listar audit logs (Viewer+)
GET /audit?start=2025-06-01T00:00:00Z&end=2025-06-01T23:59:59Z&resource=config&actor=admin
```

### 7. SSE Stream

```bash
# Conectar ao stream de eventos em tempo real (Viewer+)
GET /stream/events

# Status do stream (Viewer+)
GET /stream/status
```

---

## Testar SSE com curl

```bash
# Conectar ao stream
curl -N -H "Authorization: Bearer $API_KEY_VIEWER" \
  http://localhost:3000/stream/events

# Em outro terminal, executar um tick
curl -X POST -H "Authorization: Bearer $API_KEY_OPERATOR" \
  -H "Content-Type: application/json" \
  -d '{"symbols":["EURUSD"]}' \
  http://localhost:3000/ops/tick

# O stream vai receber eventos:
# event: ledger
# data: {"event_id":"...","event_type":"MCL_SNAPSHOT",...}
#
# event: ledger
# data: {"event_id":"...","event_type":"BRAIN_INTENT",...}
#
# event: ledger
# data: {"event_id":"...","event_type":"PM_DECISION",...}
#
# event: audit
# data: {"audit_id":"...","action":"MANUAL_ACTION",...}
```

---

## Rodar um Tick Manual

O tick manual executa um ciclo completo de decisão:

1. **MCL** — Gera snapshot de contexto de mercado para cada símbolo
2. **Brains** — Roda A2, B3, C3, D2 sobre cada snapshot
3. **PM** — Avalia cada intent gerado
4. **Persist** — Grava todos os eventos no ledger
5. **Stream** — Emite via SSE para clientes conectados

```bash
# Executar tick para EURUSD e BTCUSD
curl -X POST -H "Authorization: Bearer $API_KEY_OPERATOR" \
  -H "Content-Type: application/json" \
  -d '{"symbols":["EURUSD","BTCUSD"]}' \
  http://localhost:3000/ops/tick

# Response:
{
  "correlation_id": "...",
  "timestamp": "2025-06-01T14:30:00.000Z",
  "gate": "G0",
  "commands_sent": false,
  "events_persisted": 12,
  "summary": {
    "snapshots": 2,
    "intents": 8,
    "decisions": 8
  }
}
```

> **Nota:** Em G0 (Shadow Mode), `commands_sent` é sempre `false`. Nenhum comando é enviado ao executor.

---

## Gate State (Shadow Mode)

| Gate | Descrição | Comandos ao Executor |
|------|-----------|---------------------|
| **G0** | Shadow Mode — gera tudo, grava eventos | **NÃO** |
| **G1** | Paper Trading — simula execução | Preparado (placeholder) |
| **G2** | Live Restricted — limites reduzidos | Preparado (placeholder) |
| **G3** | Live Full — execução plena | Preparado (placeholder) |

O gate é configurado via `PUT /config` com `payload.gate`.

---

## Estrutura do Pacote

```
apps/api/
  src/
    server.ts                    # Entry point (Fastify)
    config/
      env.ts                     # Variáveis de ambiente
      gates.ts                   # Gate State + Shadow Mode
    auth/
      rbac.ts                    # Role-Based Access Control
      authMiddleware.ts          # Auth hook (API Key → Role)
    routes/
      health.routes.ts           # GET /health
      ops.routes.ts              # /ops/status, arm, disarm, kill, tick
      config.routes.ts           # GET/PUT /config
      decisions.routes.ts        # /decisions/tail, trace
      replay.routes.ts           # /replay/days, :date, export
      audit.routes.ts            # GET /audit
      stream.routes.ts           # GET /stream/events (SSE)
    services/
      decisionEngine.ts          # Pipeline MCL → Brains → PM
      ledgerService.ts           # Persist + validate + broadcast
      auditService.ts            # Audit log + espelhamento
      streamService.ts           # SSE broadcast manager
    utils/
      correlation.ts             # UUID + timestamp helpers
      validate.ts                # Validação com schemas contracts
  package.json
  tsconfig.json
  README.md
```
