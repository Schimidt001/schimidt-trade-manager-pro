// ═════════════════════════════════════════════════════════════
// Brain D2 — News
// Gera intent apenas em janela de evento macro.
//
// Regras duras:
// - event_state == PRE_EVENT ou POST_EVENT
// - NUNCA gera intent fora de janela de evento
// ═════════════════════════════════════════════════════════════

import {
  EventProximity,
  ExecutionHealth,
  VolatilityLevel,
  Severity,
  ReasonCode,
  BrainId,
} from "@schimidt-brain/contracts";

import type { BrainIntent } from "@schimidt-brain/contracts";
import type { BrainInput } from "../types/inputs";

// ─── Constantes ──────────────────────────────────────────────

/** Risco base para D2 — PRE_EVENT (mais conservador) */
const RISK_PRE_EVENT_PCT = 0.5;
/** Risco base para D2 — POST_EVENT (pode ser mais agressivo) */
const RISK_POST_EVENT_PCT = 0.75;
/** Slippage máximo aceito em bps (mais tolerante em eventos) */
const MAX_SLIPPAGE_BPS = 25;
/** Ratio risco/retorno mínimo */
const MIN_RR_RATIO = 2.0;
/** Validade do intent em minutos — PRE_EVENT */
const INTENT_VALIDITY_PRE_MINUTES = 15;
/** Validade do intent em minutos — POST_EVENT */
const INTENT_VALIDITY_POST_MINUTES = 45;
/** ATR multiplier para stop loss — PRE_EVENT (mais largo) */
const SL_ATR_MULTIPLIER_PRE = 2.5;
/** ATR multiplier para stop loss — POST_EVENT */
const SL_ATR_MULTIPLIER_POST = 2.0;
/** ATR multiplier para take profit */
const TP_ATR_MULTIPLIER = 5.0;

// ─── Helpers ─────────────────────────────────────────────────

function addMinutesToTimestamp(ts: string, minutes: number): string {
  const date = new Date(ts);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

// ─── Função principal ────────────────────────────────────────

/**
 * Gera intent baseado em evento macro.
 *
 * D2 é o único brain que opera em janelas de evento.
 * PRE_EVENT: posicionamento defensivo/hedge antes do evento
 * POST_EVENT: captura de momentum pós-evento
 *
 * @returns BrainIntent se houver edge, null caso contrário
 */
export function generateIntent(input: BrainInput): BrainIntent | null {
  const { mcl } = input;
  const states = mcl.market_states;

  // ─── Gate check ABSOLUTO ───────────────────────────────────
  // D2 NUNCA gera intent fora de janela de evento
  if (states.event_proximity === EventProximity.NONE) {
    return null;
  }

  // Execução quebrada → sem operação
  if (mcl.execution_state === ExecutionHealth.BROKEN) {
    return null;
  }

  // ─── Detecção de edge ──────────────────────────────────────

  const atr = mcl.metrics.atr;
  if (atr <= 0) {
    return null;
  }

  const isPre = states.event_proximity === EventProximity.PRE_EVENT;
  const isPost = states.event_proximity === EventProximity.POST_EVENT;

  // PRE_EVENT: só gera hedge (proteção)
  // POST_EVENT: gera trade direcional se houver momentum
  let intentType: "HEDGE" | "OPEN_LONG" | "OPEN_SHORT";
  let riskPct: number;
  let validityMinutes: number;
  let slMultiplier: number;
  let message: string;

  if (isPre) {
    // PRE_EVENT → hedge defensivo
    intentType = "HEDGE";
    riskPct = RISK_PRE_EVENT_PCT;
    validityMinutes = INTENT_VALIDITY_PRE_MINUTES;
    slMultiplier = SL_ATR_MULTIPLIER_PRE;
    message = `D2 posicionando hedge pré-evento em ${input.symbol} — proteção contra volatilidade esperada`;
  } else if (isPost) {
    // POST_EVENT → trade direcional baseado em volume/momentum
    if (mcl.metrics.volume_ratio < 1.0) {
      // Sem volume pós-evento → sem edge
      return null;
    }

    // Em volatilidade alta pós-evento, ser mais conservador
    if (states.volatility === VolatilityLevel.HIGH) {
      riskPct = RISK_POST_EVENT_PCT * 0.5;
    } else {
      riskPct = RISK_POST_EVENT_PCT;
    }

    // Direção baseada na correlação como proxy de fluxo
    const isLong = mcl.metrics.correlation_index >= 0;
    intentType = isLong ? "OPEN_LONG" : "OPEN_SHORT";
    validityMinutes = INTENT_VALIDITY_POST_MINUTES;
    slMultiplier = SL_ATR_MULTIPLIER_POST;
    message = `D2 detectou momentum pós-evento em ${input.symbol} — ${intentType} com volume ratio ${mcl.metrics.volume_ratio.toFixed(2)}`;
  } else {
    return null;
  }

  // ─── Construção do intent ──────────────────────────────────

  const stopDistance = atr * slMultiplier;
  const profitDistance = atr * TP_ATR_MULTIPLIER;
  const entryPrice = mcl.metrics.last_close;
  const isLongDirection = intentType === "OPEN_LONG" || intentType === "HEDGE";
  const stopLoss = isLongDirection
    ? entryPrice - stopDistance
    : entryPrice + stopDistance;
  const takeProfit = isLongDirection
    ? entryPrice + profitDistance
    : entryPrice - profitDistance;

  if (stopLoss <= 0 || takeProfit <= 0 || entryPrice <= 0) {
    return null;
  }

  // Verificar RR ratio (com tolerância para floating point)
  const riskDistance = Math.abs(entryPrice - stopLoss);
  const rewardDistance = Math.abs(takeProfit - entryPrice);
  if (riskDistance <= 0 || rewardDistance / riskDistance < MIN_RR_RATIO - 0.001) {
    return null;
  }

  return {
    event_id: input.event_id,
    correlation_id: input.correlation_id,
    timestamp: input.timestamp,
    severity: isPre ? Severity.WARN : Severity.INFO,
    brain_id: BrainId.D2,
    symbol: input.symbol,
    intent_type: intentType,
    proposed_risk_pct: riskPct,
    trade_plan: {
      entry_price: entryPrice,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      timeframe: isPre ? "M15" : "H1",
    },
    constraints: {
      max_slippage_bps: MAX_SLIPPAGE_BPS,
      valid_until: addMinutesToTimestamp(input.timestamp, validityMinutes),
      min_rr_ratio: MIN_RR_RATIO,
    },
    why: {
      reason_code: ReasonCode.MCL_EVENT_PROXIMITY,
      message,
    },
  };
}
