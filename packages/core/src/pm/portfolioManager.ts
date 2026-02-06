// ═════════════════════════════════════════════════════════════
// Portfolio Manager (PM vFinal)
// Função principal: evaluateIntent(intent, portfolioState) → PM_DECISION
//
// Responsabilidades:
// - Aplicar Exposure Governor (moeda / cluster / símbolo)
// - Aplicar Global Modes
// - Permitir / negar / enfileirar intents
// - Ajustar risco (MODIFY)
// - Autorizar hand-offs somente se permitido
//
// ⚠️ PM NÃO cria intent, só decide sobre intents.
// ═════════════════════════════════════════════════════════════

import {
  GlobalMode,
  Severity,
  ReasonCode,
} from "@schimidt-brain/contracts";

import type { PmDecision } from "@schimidt-brain/contracts";
import type { PmInput, CooldownEntry } from "../types/inputs";
import { checkExposure } from "./exposureGovernor";
import { checkHandoff, isHandoff } from "./handoff";

// ─── Constantes ──────────────────────────────────────────────

/** Factor de redução de risco em EVENT_CLUSTER */
const EVENT_CLUSTER_RISK_FACTOR = 0.5;
/** Factor de redução de risco em CORR_BREAK */
const CORR_BREAK_RISK_FACTOR = 0.3;
/** Factor de redução de risco em FLOW_PAYING */
const FLOW_PAYING_RISK_FACTOR = 0.8;

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Verifica se um brain ou símbolo está em cooldown.
 */
function isInCooldown(
  cooldowns: readonly CooldownEntry[],
  brainId: string,
  symbol: string,
  currentTimestamp: string
): CooldownEntry | null {
  const now = new Date(currentTimestamp).getTime();

  for (const cd of cooldowns) {
    const until = new Date(cd.until).getTime();
    if (until <= now) {
      continue; // Cooldown expirado
    }

    if (cd.scope === "GLOBAL") {
      return cd;
    }
    if (cd.scope === "BRAIN" && cd.target === brainId) {
      return cd;
    }
    if (cd.scope === "SYMBOL" && cd.target === symbol) {
      return cd;
    }
  }

  return null;
}

/**
 * Constrói o bloco risk_state para a decisão.
 */
function buildRiskState(input: PmInput) {
  return {
    current_drawdown_pct: input.portfolio.risk_state.current_drawdown_pct,
    current_exposure_pct: input.portfolio.risk_state.current_exposure_pct,
    open_positions: input.portfolio.risk_state.open_positions,
    daily_loss_pct: input.portfolio.risk_state.daily_loss_pct,
    available_risk_pct: input.portfolio.risk_state.available_risk_pct,
  };
}

// ─── Função principal ────────────────────────────────────────

/**
 * Avalia um BrainIntent e retorna uma PmDecision.
 *
 * Pipeline de decisão:
 * 1. Verificar Global Mode (RISK_OFF → DENY tudo)
 * 2. Verificar cooldowns
 * 3. Verificar hand-off (se aplicável)
 * 4. Verificar exposição
 * 5. Aplicar ajustes de risco por modo global
 * 6. Decidir: ALLOW / DENY / QUEUE / MODIFY
 *
 * @param input - Intent + estado do portfólio
 * @returns PmDecision válida segundo PmDecisionSchema
 */
export function evaluateIntent(input: PmInput): PmDecision {
  const { intent, portfolio, timestamp } = input;
  const riskState = buildRiskState(input);

  // ─── 1. Global Mode: RISK_OFF → DENY absoluto ─────────────
  if (portfolio.global_mode === GlobalMode.RISK_OFF) {
    return {
      event_id: input.event_id,
      correlation_id: input.correlation_id,
      timestamp,
      severity: Severity.WARN,
      intent_event_id: intent.event_id,
      decision: "DENY",
      risk_adjustments: null,
      risk_state: riskState,
      why: {
        reason_code: ReasonCode.PM_POSITION_DENIED,
        message: `Intent negado: sistema em modo RISK_OFF — nenhuma nova posição permitida`,
      },
    };
  }

  // ─── 2. Verificar cooldowns ────────────────────────────────
  const activeCooldown = isInCooldown(
    portfolio.cooldowns,
    intent.brain_id,
    intent.symbol,
    timestamp
  );

  if (activeCooldown !== null) {
    // Em cooldown → QUEUE (não nega, mas enfileira para reavaliação)
    return {
      event_id: input.event_id,
      correlation_id: input.correlation_id,
      timestamp,
      severity: Severity.INFO,
      intent_event_id: intent.event_id,
      decision: "QUEUE",
      risk_adjustments: null,
      risk_state: riskState,
      why: {
        reason_code: ReasonCode.PM_POSITION_QUEUED,
        message: `Intent enfileirado: ${activeCooldown.scope} cooldown ativo para ${activeCooldown.target} até ${activeCooldown.until}`,
      },
    };
  }

  // ─── 3. Verificar hand-off ─────────────────────────────────
  if (isHandoff(intent.intent_type)) {
    const handoffResult = checkHandoff(intent, portfolio);
    if (!handoffResult.allowed) {
      return {
        event_id: input.event_id,
        correlation_id: input.correlation_id,
        timestamp,
        severity: Severity.INFO,
        intent_event_id: intent.event_id,
        decision: "DENY",
        risk_adjustments: null,
        risk_state: riskState,
        why: {
          reason_code: handoffResult.reason_code ?? ReasonCode.PM_POSITION_DENIED,
          message: handoffResult.message,
        },
      };
    }

    // Hand-off CLOSE e SCALE_OUT → ALLOW direto (reduz risco)
    if (
      intent.intent_type === "CLOSE" ||
      intent.intent_type === "SCALE_OUT"
    ) {
      return {
        event_id: input.event_id,
        correlation_id: input.correlation_id,
        timestamp,
        severity: Severity.INFO,
        intent_event_id: intent.event_id,
        decision: "ALLOW",
        risk_adjustments: null,
        risk_state: riskState,
        why: {
          reason_code: ReasonCode.PM_POSITION_ALLOWED,
          message: `Hand-off ${intent.intent_type} aprovado para ${intent.symbol}`,
        },
      };
    }
    // SCALE_IN continua para verificação de exposição
  }

  // ─── 4. Verificar exposição ────────────────────────────────
  const exposureResult = checkExposure(intent, portfolio);

  if (!exposureResult.allowed) {
    // Se há sugestão de risco reduzido → MODIFY
    if (exposureResult.suggested_risk_pct !== null) {
      return {
        event_id: input.event_id,
        correlation_id: input.correlation_id,
        timestamp,
        severity: Severity.WARN,
        intent_event_id: intent.event_id,
        decision: "MODIFY",
        risk_adjustments: {
          original_risk_pct: intent.proposed_risk_pct,
          adjusted_risk_pct: exposureResult.suggested_risk_pct,
          adjustment_reason: exposureResult.message,
        },
        risk_state: riskState,
        why: {
          reason_code: exposureResult.reason_code ?? ReasonCode.PM_RISK_ADJUSTED,
          message: exposureResult.message,
        },
      };
    }

    // Sem alternativa → DENY
    return {
      event_id: input.event_id,
      correlation_id: input.correlation_id,
      timestamp,
      severity: Severity.WARN,
      intent_event_id: intent.event_id,
      decision: "DENY",
      risk_adjustments: null,
      risk_state: riskState,
      why: {
        reason_code: exposureResult.reason_code ?? ReasonCode.PM_POSITION_DENIED,
        message: exposureResult.message,
      },
    };
  }

  // ─── 5. Ajuste de risco por Global Mode ────────────────────
  let adjustedRiskPct = intent.proposed_risk_pct;
  let riskAdjustmentReason: string | null = null;

  switch (portfolio.global_mode) {
    case GlobalMode.EVENT_CLUSTER:
      adjustedRiskPct = intent.proposed_risk_pct * EVENT_CLUSTER_RISK_FACTOR;
      riskAdjustmentReason = `Risco reduzido por modo EVENT_CLUSTER (factor ${EVENT_CLUSTER_RISK_FACTOR})`;
      break;
    case GlobalMode.CORR_BREAK:
      adjustedRiskPct = intent.proposed_risk_pct * CORR_BREAK_RISK_FACTOR;
      riskAdjustmentReason = `Risco reduzido por modo CORR_BREAK (factor ${CORR_BREAK_RISK_FACTOR})`;
      break;
    case GlobalMode.FLOW_PAYING:
      adjustedRiskPct = intent.proposed_risk_pct * FLOW_PAYING_RISK_FACTOR;
      riskAdjustmentReason = `Risco ajustado por modo FLOW_PAYING (factor ${FLOW_PAYING_RISK_FACTOR})`;
      break;
    case GlobalMode.NORMAL:
    default:
      // Sem ajuste
      break;
  }

  // Se houve ajuste de risco → MODIFY
  if (riskAdjustmentReason !== null && adjustedRiskPct !== intent.proposed_risk_pct) {
    return {
      event_id: input.event_id,
      correlation_id: input.correlation_id,
      timestamp,
      severity: Severity.INFO,
      intent_event_id: intent.event_id,
      decision: "MODIFY",
      risk_adjustments: {
        original_risk_pct: intent.proposed_risk_pct,
        adjusted_risk_pct: adjustedRiskPct,
        adjustment_reason: riskAdjustmentReason,
      },
      risk_state: riskState,
      why: {
        reason_code: ReasonCode.PM_RISK_ADJUSTED,
        message: riskAdjustmentReason,
      },
    };
  }

  // ─── 6. Tudo OK → ALLOW ───────────────────────────────────
  return {
    event_id: input.event_id,
    correlation_id: input.correlation_id,
    timestamp,
    severity: Severity.INFO,
    intent_event_id: intent.event_id,
    decision: "ALLOW",
    risk_adjustments: null,
    risk_state: riskState,
    why: {
      reason_code: ReasonCode.PM_POSITION_ALLOWED,
      message: `Intent aprovado: risco ${intent.proposed_risk_pct.toFixed(1)}% dentro dos limites para ${intent.symbol}`,
    },
  };
}
