_**AVISO:** Este documento é gerado e mantido pelo Agente 1 (Contracts & Schemas). Não edite manualmente._

# Especificação de Schemas — Schimidt Brain

**Versão:** 1.0.0
**Data:** 2026-02-06

## 1. Visão Geral

Este documento é o manual institucional e a **fonte única da verdade** para todos os formatos de dados, eventos e contratos utilizados no ecossistema Schimidt Brain. O pacote `@schimidt-brain/contracts` garante consistência, auditabilidade e interoperabilidade entre todos os agentes e serviços.

Todos os schemas são definidos com **Zod** em modo estrito, geram **types** automaticamente via inferência e podem ser exportados para **JSON Schema**. A adesão a estes contratos é **obrigatória** e não deve ser contornada sob nenhuma circunstância.

Os princípios de design são:

- **Imutabilidade:** Contratos são versionados e não devem sofrer breaking changes.
- **Clareza:** Nomes e estruturas são explícitos e auto-descritivos.
- **Consistência:** Campos comuns como `correlation_id`, `timestamp` e o bloco `why` são padronizados.
- **Auditabilidade:** Todos os eventos são projetados para serem facilmente registrados e auditados.

## 2. Resumo dos Schemas

A tabela a seguir resume os principais schemas de eventos do sistema.

| Schema                   | Origem | Propósito                                                              |
| ------------------------ | ------ | ---------------------------------------------------------------------- |
| `MclSnapshot`            | MCL    | Emite um snapshot completo do contexto de mercado para um ativo.       |
| `BrainIntent`            | Brains | Propõe uma ação de trading (abrir, fechar, etc.) para o PM.            |
| `PmDecision`             | PM     | Responde a um `BrainIntent` com uma decisão (ALLOW, DENY, etc.).       |
| `EhmAction`              | EHM    | Emite uma ação de emergência (reduzir risco, cooldown, etc.).          |
| `ExecutionStateChange`   | EHM    | Notifica uma mudança no estado de saúde da camada de execução.         |
| `ProviderStateChange`    | EHM    | Notifica uma mudança no estado de um provedor de dados/execução.       |
| `AuditLog`               | System | Registra uma ação manual ou mudança de configuração crítica.           |

## 3. Detalhes dos Schemas

### 3.1. MclSnapshot

Snapshot completo do contexto de mercado emitido pelo **Market Context Layer (MCL)**.

- **Campos Obrigatórios:** `event_id`, `correlation_id`, `timestamp`, `severity`, `symbol`, `global_mode`, `market_states`, `metrics`, `execution_state`, `why`
- **Enums Usados:** `Severity`, `GlobalMode`, `MarketStructure`, `VolatilityLevel`, `LiquidityPhase`, `MarketSession`, `EventProximity`, `ExecutionHealth`, `ReasonCode`

**Exemplo JSON Válido:**

```json
{
  "event_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "correlation_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "timestamp": "2025-06-15T10:30:00-03:00",
  "severity": "INFO",
  "symbol": "EURUSD",
  "global_mode": "NORMAL",
  "market_states": {
    "structure": "TREND",
    "volatility": "NORMAL",
    "liquidity_phase": "CLEAN",
    "session": "NY",
    "event_proximity": "NONE"
  },
  "metrics": {
    "atr": 0.0012,
    "spread_bps": 1.5,
    "volume_ratio": 1.2,
    "correlation_index": 0.85
  },
  "execution_state": "OK",
  "why": {
    "reason_code": "MCL_SESSION_OPEN",
    "message": "Sessão de NY aberta com condições normais"
  }
}
```

### 3.2. BrainIntent

Intenção de trade emitida por um **Brain** (A2, B3, etc.) e enviada ao **Portfolio Manager (PM)** para avaliação.

- **Campos Obrigatórios:** `event_id`, `correlation_id`, `timestamp`, `severity`, `brain_id`, `symbol`, `intent_type`, `proposed_risk_pct`, `trade_plan`, `constraints`, `why`
- **Enums Usados:** `Severity`, `BrainId`, `IntentTypeEnum`, `ReasonCode`

**Exemplo JSON Válido:**

```json
{
  "event_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "correlation_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "timestamp": "2025-06-15T10:30:00-03:00",
  "severity": "INFO",
  "brain_id": "A2",
  "symbol": "EURUSD",
  "intent_type": "OPEN_LONG",
  "proposed_risk_pct": 1.5,
  "trade_plan": {
    "entry_price": 1.085,
    "stop_loss": 1.082,
    "take_profit": 1.092,
    "timeframe": "1H"
  },
  "constraints": {
    "max_slippage_bps": 3,
    "valid_until": "2025-06-15T11:30:00-03:00",
    "min_rr_ratio": 2
  },
  "why": {
    "reason_code": "MCL_STRUCTURE_CHANGE",
    "message": "Estrutura de tendência confirmada no 1H com confluência"
  }
}
```

### 3.3. PmDecision

Decisão do **Portfolio Manager (PM)** em resposta a um `BrainIntent`.

- **Campos Obrigatórios:** `event_id`, `correlation_id`, `timestamp`, `severity`, `intent_event_id`, `decision`, `risk_adjustments`, `risk_state`, `why`
- **Enums Usados:** `Severity`, `PmDecisionTypeEnum`, `ReasonCode`

**Exemplo JSON Válido:**

```json
{
  "event_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "correlation_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "timestamp": "2025-06-15T10:30:00-03:00",
  "severity": "INFO",
  "intent_event_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "decision": "ALLOW",
  "risk_adjustments": null,
  "risk_state": {
    "current_drawdown_pct": -1.2,
    "current_exposure_pct": 3.5,
    "open_positions": 2,
    "daily_loss_pct": -0.5,
    "available_risk_pct": 6.5
  },
  "why": {
    "reason_code": "PM_POSITION_ALLOWED",
    "message": "Risco dentro dos limites, posição aprovada"
  }
}
```

### 3.4. EhmAction

Ação de proteção emitida pelo **Emergency & Health Manager (EHM)**.

- **Campos Obrigatórios:** `event_id`, `correlation_id`, `timestamp`, `severity`, `action`, `affected_brains`, `affected_symbols`, `cooldown`, `why`
- **Enums Usados:** `Severity`, `EhmActionTypeEnum`, `CooldownScopeEnum`, `BrainId`, `ReasonCode`

**Exemplo JSON Válido:**

```json
{
  "event_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "correlation_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "timestamp": "2025-06-15T10:30:00-03:00",
  "severity": "WARN",
  "action": "COOLDOWN",
  "affected_brains": ["A2", "B3"],
  "affected_symbols": ["EURUSD"],
  "cooldown": {
    "scope": "BRAIN",
    "target": "A2",
    "until": "2025-06-15T12:00:00-03:00"
  },
  "why": {
    "reason_code": "EHM_COOLDOWN_ACTIVATED",
    "message": "Cooldown ativado após sequência de perdas no brain A2"
  }
}
```

### 3.5. ExecutionStateChange

Notifica uma mudança no estado de saúde da camada de execução.

- **Campos Obrigatórios:** `event_id`, `correlation_id`, `timestamp`, `severity`, `previous_state`, `new_state`, `why`
- **Enums Usados:** `Severity`, `ExecutionHealth`, `ReasonCode`

**Exemplo JSON Válido:**

```json
{
  "event_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "correlation_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "timestamp": "2025-06-15T10:30:00-03:00",
  "severity": "WARN",
  "previous_state": "OK",
  "new_state": "DEGRADED",
  "why": {
    "reason_code": "EXEC_DEGRADED",
    "message": "Latência elevada detectada na camada de execução"
  }
}
```

### 3.6. ProviderStateChange

Notifica uma mudança no estado de um provedor externo (ex: corretora, fonte de dados).

- **Campos Obrigatórios:** `event_id`, `correlation_id`, `timestamp`, `severity`, `provider`, `previous_state`, `new_state`, `why`
- **Enums Usados:** `Severity`, `ProviderHealthEnum`, `ReasonCode`

**Exemplo JSON Válido:**

```json
{
  "event_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "correlation_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "timestamp": "2025-06-15T10:30:00-03:00",
  "severity": "ERROR",
  "provider": "binance",
  "previous_state": "CONNECTED",
  "new_state": "DISCONNECTED",
  "why": {
    "reason_code": "PROV_DISCONNECTED",
    "message": "Provider binance perdeu conexão WebSocket"
  }
}
```

### 3.7. AuditLog

Registra uma ação de auditoria crítica, como uma mudança de configuração ou uma intervenção manual.

- **Campos Obrigatórios:** `event_id`, `correlation_id`, `timestamp`, `severity`, `actor`, `action`, `resource`, `diff`, `reason`, `reason_code`
- **Enums Usados:** `Severity`, `AuditActionEnum`, `ReasonCode`

**Exemplo JSON Válido:**

```json
{
  "event_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "correlation_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "timestamp": "2025-06-15T10:30:00-03:00",
  "severity": "INFO",
  "actor": {
    "user": "admin@schimidt.com",
    "role": "admin"
  },
  "action": "CONFIG_CHANGE",
  "resource": "config.risk_limits",
  "diff": {
    "before": { "max_drawdown_pct": 5 },
    "after": { "max_drawdown_pct": 3 }
  },
  "reason": "Redução do limite de drawdown por precaução pré-FOMC",
  "reason_code": "AUDIT_CONFIG_CHANGED"
}
```

## 4. Catálogo de Reason Codes

O `REASON_CODE_CATALOG` é o registro central de todos os códigos de razão e suas descrições humanas. Nenhum outro agente pode inventar `reason_code`. A lista completa está disponível no enum `ReasonCode` e no objeto `REASON_CODE_CATALOG` exportados pelo pacote.

**Categorias:**

- `MCL`: Motivos relacionados ao contexto de mercado.
- `PM / Risk`: Motivos relacionados a decisões de risco e portfólio.
- `EHM`: Motivos relacionados a ações de emergência e saúde do sistema.
- `Execution`: Motivos relacionados à camada de execução de ordens.
- `Provider`: Motivos relacionados a provedores externos.
- `Config / Audit`: Motivos relacionados a mudanças de configuração e auditoria.
