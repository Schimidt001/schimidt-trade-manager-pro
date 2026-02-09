// ═════════════════════════════════════════════════════════════
// Brain B3 — Relative Value
// Analisa relações relativas entre ativos.
// Gera intent NEUTRAL / SPREAD.
//
// Regras duras:
// - volatility_state != HIGH
// - event_state == NONE
// ═════════════════════════════════════════════════════════════

import {
  VolatilityLevel,
  EventProximity,
  ExecutionHealth,
  Severity,
  ReasonCode,
  BrainId,
} from "@schimidt-brain/contracts";

import type { BrainIntent } from "@schimidt-brain/contracts";
import type { BrainInput } from "../types/inputs";

// ─── Constantes ──────────────────────────────────────────────

/** Risco base para B3 (percentual do capital) */
const BASE_RISK_PCT = 0.75;
/** Slippage máximo aceito em bps */
const MAX_SLIPPAGE_BPS = 20;
/** Ratio risco/retorno mínimo */
const MIN_RR_RATIO = 1.5;
/** Validade do intent em minutos */
const INTENT_VALIDITY_MINUTES = 60;
/** Limiar de correlação para detectar divergência */
const CORRELATION_DIVERGENCE_THRESHOLD = 0.3;
/** Limiar de correlação para spread trade */
const CORRELATION_SPREAD_THRESHOLD = 0.7;
/** ATR multiplier para stop loss */
const SL_ATR_MULTIPLIER = 2.0;
/** ATR multiplier para take profit */
const TP_ATR_MULTIPLIER = 3.0;

// ─── Helpers ─────────────────────────────────────────────────

function addMinutesToTimestamp(ts: string, minutes: number): string {
  const date = new Date(ts);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

// ─── Função principal ────────────────────────────────────────

/**
 * Gera intent de Relative Value.
 *
 * Analisa correlação entre ativos para identificar oportunidades
 * de mean-reversion ou spread trades.
 *
 * @returns BrainIntent se houver edge, null caso contrário
 */
export function generateIntent(input: BrainInput): BrainIntent | null {
  const { mcl } = input;
  const states = mcl.market_states;

  // ─── Gate checks (regras duras) ────────────────────────────

  // Não opera em volatilidade alta
  if (states.volatility === VolatilityLevel.HIGH) {
    return null;
  }

  // Só opera quando não há evento
  if (states.event_proximity !== EventProximity.NONE) {
    return null;
  }

  // Precisa de execução OK ou pelo menos DEGRADED (B3 é menos sensível)
  if (mcl.execution_state === ExecutionHealth.BROKEN) {
    return null;
  }

  // ─── Detecção de edge ──────────────────────────────────────

  const corrIndex = mcl.metrics.correlation_index;
  const atr = mcl.metrics.atr;

  if (atr <= 0) {
    return null;
  }

  // B3 detecta dois tipos de oportunidade:
  // 1. Divergência de correlação (correlação caiu abaixo do normal)
  //    → mean-reversion trade
  // 2. Correlação forte com spread anômalo
  //    → spread trade

  const isDivergence = Math.abs(corrIndex) < CORRELATION_DIVERGENCE_THRESHOLD;
  const isHighCorrelation = Math.abs(corrIndex) > CORRELATION_SPREAD_THRESHOLD;

  if (!isDivergence && !isHighCorrelation) {
    return null;
  }

  // Volume ratio muito baixo → mercado sem liquidez para relative value
  if (mcl.metrics.volume_ratio < 0.5) {
    return null;
  }

  // ─── Construção do intent ──────────────────────────────────

  // Divergência → HEDGE (mean-reversion via posição hedgeada)
  // Alta correlação → OPEN_LONG ou OPEN_SHORT (spread trade)
  let intentType: "OPEN_LONG" | "OPEN_SHORT" | "HEDGE";
  let message: string;

  if (isDivergence) {
    intentType = "HEDGE";
    message = `B3 detectou divergência de correlação (${corrIndex.toFixed(2)}) em ${input.symbol} — oportunidade de mean-reversion`;
  } else {
    // Alta correlação: direção baseada no volume ratio
    // Volume acima da média → momentum positivo → LONG
    // Volume abaixo da média → momentum negativo → SHORT
    intentType = mcl.metrics.volume_ratio >= 1.0 ? "OPEN_LONG" : "OPEN_SHORT";
    message = `B3 detectou correlação forte (${corrIndex.toFixed(2)}) com spread anômalo em ${input.symbol} — ${intentType}`;
  }

  const stopDistance = atr * SL_ATR_MULTIPLIER;
  const profitDistance = atr * TP_ATR_MULTIPLIER;
  const entryPrice = mcl.metrics.last_close;
  const isLong = intentType === "OPEN_LONG" || intentType === "HEDGE";
  const stopLoss = isLong
    ? entryPrice - stopDistance
    : entryPrice + stopDistance;
  const takeProfit = isLong
    ? entryPrice + profitDistance
    : entryPrice - profitDistance;

  if (stopLoss <= 0 || takeProfit <= 0 || entryPrice <= 0) {
    return null;
  }

  // Verificar RR ratio
  const riskDistance = Math.abs(entryPrice - stopLoss);
  const rewardDistance = Math.abs(takeProfit - entryPrice);
  if (riskDistance <= 0 || rewardDistance / riskDistance < MIN_RR_RATIO - 0.001) {
    return null;
  }

  return {
    event_id: input.event_id,
    correlation_id: input.correlation_id,
    timestamp: input.timestamp,
    severity: Severity.INFO,
    brain_id: BrainId.B3,
    symbol: input.symbol,
    intent_type: intentType,
    proposed_risk_pct: BASE_RISK_PCT,
    trade_plan: {
      entry_price: entryPrice,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      timeframe: "H1",
    },
    constraints: {
      max_slippage_bps: MAX_SLIPPAGE_BPS,
      valid_until: addMinutesToTimestamp(input.timestamp, INTENT_VALIDITY_MINUTES),
      min_rr_ratio: MIN_RR_RATIO,
    },
    why: {
      reason_code: ReasonCode.MCL_CORRELATION_SHIFT,
      message,
    },
  };
}
