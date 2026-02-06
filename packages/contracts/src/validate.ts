/**
 * Script de validação — NÃO faz parte do build.
 * Usado para verificar que todos os schemas validam corretamente
 * e que JSON Schema exporta sem erro.
 *
 * Executar: npx ts-node src/validate.ts
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { MclSnapshotSchema } from "./schemas/mcl.schema";
import { BrainIntentSchema } from "./schemas/intent.schema";
import { PmDecisionSchema } from "./schemas/pm-decision.schema";
import { EhmActionSchema } from "./schemas/ehm-action.schema";
import { ExecutionStateChangeSchema } from "./schemas/execution-state.schema";
import { ProviderStateChangeSchema } from "./schemas/provider-state.schema";
import { AuditLogSchema } from "./schemas/audit-log.schema";
import { ReasonCode, REASON_CODE_CATALOG } from "./enums/reason-codes";

// ─── Dados de teste ──────────────────────────────────────────

const VALID_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const VALID_TS = "2025-06-15T10:30:00-03:00";

const mclSample = {
  event_id: VALID_UUID,
  correlation_id: VALID_UUID,
  timestamp: VALID_TS,
  severity: "INFO",
  symbol: "EURUSD",
  global_mode: "NORMAL",
  market_states: {
    structure: "TREND",
    volatility: "NORMAL",
    liquidity_phase: "CLEAN",
    session: "NY",
    event_proximity: "NONE",
  },
  metrics: {
    atr: 0.0012,
    spread_bps: 1.5,
    volume_ratio: 1.2,
    correlation_index: 0.85,
  },
  execution_state: "OK",
  why: {
    reason_code: "MCL_SESSION_OPEN",
    message: "Sessão de NY aberta com condições normais",
  },
};

const intentSample = {
  event_id: VALID_UUID,
  correlation_id: VALID_UUID,
  timestamp: VALID_TS,
  severity: "INFO",
  brain_id: "A2",
  symbol: "EURUSD",
  intent_type: "OPEN_LONG",
  proposed_risk_pct: 1.5,
  trade_plan: {
    entry_price: 1.0850,
    stop_loss: 1.0820,
    take_profit: 1.0920,
    timeframe: "1H",
  },
  constraints: {
    max_slippage_bps: 3,
    valid_until: "2025-06-15T11:30:00-03:00",
    min_rr_ratio: 2.0,
  },
  why: {
    reason_code: "MCL_STRUCTURE_CHANGE",
    message: "Estrutura de tendência confirmada no 1H com confluência",
  },
};

const pmDecisionSample = {
  event_id: VALID_UUID,
  correlation_id: VALID_UUID,
  timestamp: VALID_TS,
  severity: "INFO",
  intent_event_id: VALID_UUID,
  decision: "ALLOW",
  risk_adjustments: null,
  risk_state: {
    current_drawdown_pct: -1.2,
    current_exposure_pct: 3.5,
    open_positions: 2,
    daily_loss_pct: -0.5,
    available_risk_pct: 6.5,
  },
  why: {
    reason_code: "PM_POSITION_ALLOWED",
    message: "Risco dentro dos limites, posição aprovada",
  },
};

const ehmActionSample = {
  event_id: VALID_UUID,
  correlation_id: VALID_UUID,
  timestamp: VALID_TS,
  severity: "WARN",
  action: "COOLDOWN",
  affected_brains: ["A2", "B3"],
  affected_symbols: ["EURUSD"],
  cooldown: {
    scope: "BRAIN",
    target: "A2",
    until: "2025-06-15T12:00:00-03:00",
  },
  why: {
    reason_code: "EHM_COOLDOWN_ACTIVATED",
    message: "Cooldown ativado após sequência de perdas no brain A2",
  },
};

const execStateSample = {
  event_id: VALID_UUID,
  correlation_id: VALID_UUID,
  timestamp: VALID_TS,
  severity: "WARN",
  previous_state: "OK",
  new_state: "DEGRADED",
  why: {
    reason_code: "EXEC_DEGRADED",
    message: "Latência elevada detectada na camada de execução",
  },
};

const provStateSample = {
  event_id: VALID_UUID,
  correlation_id: VALID_UUID,
  timestamp: VALID_TS,
  severity: "ERROR",
  provider: "binance",
  previous_state: "CONNECTED",
  new_state: "DISCONNECTED",
  why: {
    reason_code: "PROV_DISCONNECTED",
    message: "Provider binance perdeu conexão WebSocket",
  },
};

const auditLogSample = {
  event_id: VALID_UUID,
  correlation_id: VALID_UUID,
  timestamp: VALID_TS,
  severity: "INFO",
  actor: {
    user: "admin@schimidt.com",
    role: "admin",
  },
  action: "CONFIG_CHANGE",
  resource: "config.risk_limits",
  diff: {
    before: { max_drawdown_pct: 5 },
    after: { max_drawdown_pct: 3 },
  },
  reason: "Redução do limite de drawdown por precaução pré-FOMC",
  reason_code: "AUDIT_CONFIG_CHANGED",
};

// ─── Validação ───────────────────────────────────────────────

let passed = 0;
let failed = 0;

function validate(name: string, schema: { safeParse: (d: unknown) => { success: boolean; error?: unknown } }, data: unknown): void {
  const result = schema.safeParse(data);
  if (result.success) {
    console.log(`  ✅ ${name} — VÁLIDO`);
    passed++;
  } else {
    console.error(`  ❌ ${name} — INVÁLIDO`);
    console.error(`     Erros:`, JSON.stringify(result.error, null, 2));
    failed++;
  }
}

function validateJsonSchema(name: string, schema: unknown): void {
  try {
    const jsonSchema = zodToJsonSchema(schema as Parameters<typeof zodToJsonSchema>[0], name);
    if (jsonSchema && typeof jsonSchema === "object") {
      console.log(`  ✅ ${name} — JSON Schema gerado com sucesso`);
      passed++;
    } else {
      console.error(`  ❌ ${name} — JSON Schema vazio`);
      failed++;
    }
  } catch (err) {
    console.error(`  ❌ ${name} — Erro ao gerar JSON Schema:`, err);
    failed++;
  }
}

console.log("\n══════════════════════════════════════════════════════");
console.log("  VALIDAÇÃO DOS CONTRATOS — @schimidt-brain/contracts");
console.log("══════════════════════════════════════════════════════\n");

console.log("📋 1. Validação de dados de exemplo:\n");
validate("MclSnapshot", MclSnapshotSchema, mclSample);
validate("BrainIntent", BrainIntentSchema, intentSample);
validate("PmDecision", PmDecisionSchema, pmDecisionSample);
validate("EhmAction", EhmActionSchema, ehmActionSample);
validate("ExecutionStateChange", ExecutionStateChangeSchema, execStateSample);
validate("ProviderStateChange", ProviderStateChangeSchema, provStateSample);
validate("AuditLog", AuditLogSchema, auditLogSample);

console.log("\n📋 2. Exportação JSON Schema:\n");
validateJsonSchema("MclSnapshot", MclSnapshotSchema);
validateJsonSchema("BrainIntent", BrainIntentSchema);
validateJsonSchema("PmDecision", PmDecisionSchema);
validateJsonSchema("EhmAction", EhmActionSchema);
validateJsonSchema("ExecutionStateChange", ExecutionStateChangeSchema);
validateJsonSchema("ProviderStateChange", ProviderStateChangeSchema);
validateJsonSchema("AuditLog", AuditLogSchema);

console.log("\n📋 3. Catálogo de Reason Codes:\n");
const allCodes = Object.values(ReasonCode);
const catalogKeys = Object.keys(REASON_CODE_CATALOG);
if (allCodes.length === catalogKeys.length) {
  console.log(`  ✅ Todos os ${allCodes.length} reason codes possuem descrição no catálogo`);
  passed++;
} else {
  console.error(`  ❌ Mismatch: ${allCodes.length} codes vs ${catalogKeys.length} descrições`);
  failed++;
}

console.log("\n══════════════════════════════════════════════════════");
console.log(`  RESULTADO: ${passed} passou | ${failed} falhou`);
console.log("══════════════════════════════════════════════════════\n");

if (failed > 0) {
  process.exit(1);
}
