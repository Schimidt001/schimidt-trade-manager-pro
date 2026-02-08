# Relatório de Evidências — Entregas A/B/C/D

**Commit:** `3581121` (main)  
**Data:** 2026-02-08  
**Resultado:** 23/23 verificações passaram

---

## Teste 1 — Tick Completo (Seção 5.1)

**Endpoint:** `POST /ops/tick` com `{"symbols":["EURUSD","GBPUSD","USDJPY","BTCUSD"]}`

| Verificação | Resultado | Valor |
|---|---|---|
| MCL_SNAPSHOT gerado | PASS | 4 snapshots (1 por símbolo) |
| BRAIN_INTENT gerado | PASS | 4 intents (A2/EURUSD, C3/GBPUSD, B3/USDJPY, D2/BTCUSD) |
| PM_DECISION gerado | PASS | 4 decisions |
| Eventos persistidos no ledger | PASS | 28 eventos |
| mock_mode=true no response | PASS | `"mock_mode": true` |

**Cadeia de correlação completa (1 tick):**

```
MCL_SNAPSHOT  | EURUSD |    | MOCK_MCL_SNAPSHOT
BRAIN_INTENT  | EURUSD | A2 | MOCK_BRAIN_INTENT
BRAIN_SKIP    | EURUSD | B3 | MOCK_BRAIN_SKIP
BRAIN_SKIP    | EURUSD | C3 | MOCK_BRAIN_SKIP
BRAIN_SKIP    | EURUSD | D2 | MOCK_BRAIN_SKIP
MCL_SNAPSHOT  | GBPUSD |    | MOCK_MCL_SNAPSHOT
BRAIN_SKIP    | GBPUSD | A2 | MOCK_BRAIN_SKIP
BRAIN_SKIP    | GBPUSD | B3 | MOCK_BRAIN_SKIP
BRAIN_INTENT  | GBPUSD | C3 | MOCK_BRAIN_INTENT
BRAIN_SKIP    | GBPUSD | D2 | MOCK_BRAIN_SKIP
MCL_SNAPSHOT  | USDJPY |    | MOCK_MCL_SNAPSHOT
BRAIN_SKIP    | USDJPY | A2 | MOCK_BRAIN_SKIP
BRAIN_INTENT  | USDJPY | B3 | MOCK_BRAIN_INTENT
BRAIN_SKIP    | USDJPY | C3 | MOCK_BRAIN_SKIP
BRAIN_SKIP    | USDJPY | D2 | MOCK_BRAIN_SKIP
MCL_SNAPSHOT  | BTCUSD |    | MOCK_MCL_SNAPSHOT
BRAIN_SKIP    | BTCUSD | A2 | MOCK_BRAIN_SKIP
BRAIN_SKIP    | BTCUSD | B3 | MOCK_BRAIN_SKIP
BRAIN_SKIP    | BTCUSD | C3 | MOCK_BRAIN_SKIP
BRAIN_INTENT  | BTCUSD | D2 | MOCK_BRAIN_INTENT
PM_DECISION   | EURUSD | A2 | MOCK_PM_DECISION
PM_DECISION   | GBPUSD | C3 | MOCK_PM_DECISION
PM_DECISION   | USDJPY | B3 | MOCK_PM_DECISION
PM_DECISION   | BTCUSD | D2 | MOCK_PM_DECISION
EXECUTOR_COMMAND (x12)  | EXEC_STATE_CHANGE
EXEC_SIMULATED_COMMAND | EURUSD | A2 | EXEC_SIMULATED_COMMAND
EXEC_SIMULATED_COMMAND | GBPUSD | C3 | EXEC_SIMULATED_COMMAND
EXEC_SIMULATED_COMMAND | USDJPY | B3 | EXEC_SIMULATED_COMMAND
EXEC_SIMULATED_COMMAND | BTCUSD | D2 | EXEC_SIMULATED_COMMAND
```

---

## Teste 2 — Gate Promotion (Seção 5.2)

**Endpoint:** `POST /ops/gate/promote`

| Verificação | Resultado | Detalhes |
|---|---|---|
| G0 → G1 com fluxo oficial | PASS | HTTP 200, reason_code: GATE_PROMOTED |
| Transição inválida G1 → G3 | PASS | HTTP 409, rejeitada |
| RBAC: Operator não pode promover | PASS | HTTP 403 |
| /ops/status.gate atualizado | PASS | gate: "G1" |

**Response da promoção:**
```json
{
    "status": "PROMOTED",
    "from_gate": "G0",
    "to_gate": "G1",
    "reason_code": "GATE_PROMOTED",
    "message": "Gate promovido de G0 para G1",
    "correlation_id": "12061161-cc27-4b2f-960c-c6692516c5c4"
}
```

---

## Teste 3 — ARM/DISARM/KILL (Seção 5.3)

| Verificação | Resultado | Detalhes |
|---|---|---|
| ARM em G1 | PASS | HTTP 200, arm_state=ARMED |
| DISARM | PASS | HTTP 200, arm_state=DISARMED |
| KILL → risk_off=true | PASS | risk_off=True |
| KILL → DISARM | PASS | arm_state=DISARMED |
| Audit logs gerados | PASS | 11 audit logs no banco |

**Response do KILL:**
```json
{
    "status": "KILLED",
    "arm_state": "DISARMED",
    "risk_off": true,
    "message": "Kill switch ativado. Sistema desarmado e em RISK_OFF."
}
```

---

## Teste 4 — Execução Simulada (Seção 5.4)

**Cenário:** G1 + ARMED → RUN TICK

| Verificação | Resultado | Detalhes |
|---|---|---|
| commands_sent = true | PASS | Em G1+ARMED |
| PM_DECISION gerado | PASS | 4 decisions |
| EXEC_SIMULATED_COMMAND no ledger | PASS | 4 eventos simulados |
| Executor conectado | PASS | connectivity=connected |
| executor_status.mode | PASS | SIMULATOR |

**Executor status:**
```json
{
  "connected": true,
  "mode": "SIMULATOR",
  "active_strategy": "D2_M15",
  "active_symbols": ["BTCUSD"],
  "health": {
    "latency_ms": 25,
    "error_rate": 0,
    "execution_state": "OK"
  }
}
```

---

## Verificação de payload.mock=true (Entrega B)

| event_type | total | mock=true | mock ausente |
|---|---|---|---|
| BRAIN_INTENT | 12 | 12 | 0 |
| BRAIN_SKIP | 36 | 36 | 0 |
| EXEC_SIMULATED_COMMAND | 12 | 12 | 0 |
| MCL_SNAPSHOT | 12 | 12 | 0 |
| PM_DECISION | 12 | 12 | 0 |

**100% dos eventos de tick marcados com `payload.mock=true` e `reason_code=MOCK_*`.**

---

## Arquivos Modificados

| Arquivo | Entrega | Descrição |
|---|---|---|
| `packages/contracts/src/enums/reason-codes.ts` | A/B/C | Novos reason codes: GATE_PROMOTED, GATE_PREREQ_*, MOCK_*, EXEC_SIMULATED_* |
| `apps/api/src/config/gates.ts` | A/B | mock_mode, risk_off, last_tick_result no OperationalState |
| `apps/api/src/routes/ops.routes.ts` | A | POST /ops/gate/promote + tick atualizado |
| `apps/api/src/services/decisionEngine.ts` | B/C | Mock markers + execução simulada |
| `apps/ui/src/components/layout/TopBar.tsx` | B/D | Badge MOCK |
| `apps/ui/src/components/layout/AppShell.tsx` | B/D | Fetch mock_mode/executor_mode |
| `apps/ui/src/app/replay/page.tsx` | D | Mensagem clara quando vazio |
| `apps/ui/src/app/calendar/page.tsx` | D | DEGRADED: NO_PROVIDER |
| `apps/ui/src/app/config/brains/page.tsx` | D | Nota sobre symbols locais |
| `apps/ui/src/components/cockpit/GlobalStatusBar.tsx` | B/D | Indicadores mock/risk_off |
| `apps/ui/src/app/cockpit/page.tsx` | B/D | Props mockMode/riskOff |
| `apps/ui/src/components/cockpit/QuickActions.tsx` | D | Mensagem gate/promote |
