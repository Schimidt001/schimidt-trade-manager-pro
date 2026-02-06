// ═════════════════════════════════════════════════════════════
// Brain C3 — Momentum Two-Speed
// Detecta continuação de tendência.
// Distingue early continuation vs confirmed continuation.
//
// Regras duras:
// - structure_state == TREND
// - liquidity_state == CLEAN
// - execution_state == OK
// ═════════════════════════════════════════════════════════════

import {
  MarketStructure,
  LiquidityPhase,
  ExecutionHealth,
  VolatilityLevel,
  Severity,
  ReasonCode,
  BrainId,
} from "@schimidt-brain/contracts";

import type { BrainIntent } from "@schimidt-brain/contracts";
import type { BrainInput } from "../types/inputs";

// ─── Constantes ──────────────────────────────────────────────

/** Risco base para C3 — early continuation */
const RISK_EARLY_PCT = 0.5;
/** Risco base para C3 — confirmed continuation */
const RISK_CONFIRMED_PCT = 1.0;
/** Slippage máximo aceito em bps */
const MAX_SLIPPAGE_BPS = 10;
/** Ratio risco/retorno mínimo */
const MIN_RR_RATIO = 2.5;
/** Validade do intent em minutos */
const INTENT_VALIDITY_MINUTES = 45;
/** Volume ratio mínimo para confirmed continuation */
const VOLUME_CONFIRMED_THRESHOLD = 1.3;
/** Volume ratio mínimo para early continuation */
const VOLUME_EARLY_THRESHOLD = 0.9;
/** ATR multiplier para stop loss */
const SL_ATR_MULTIPLIER = 1.2;
/** ATR multiplier para take profit — early */
const TP_ATR_MULTIPLIER_EARLY = 3.0;
/** ATR multiplier para take profit — confirmed */
const TP_ATR_MULTIPLIER_CONFIRMED = 4.0;

// ─── Tipos internos ─────────────────────────────────────────

type ContinuationType = "EARLY" | "CONFIRMED";

// ─── Helpers ─────────────────────────────────────────────────

function addMinutesToTimestamp(ts: string, minutes: number): string {
  const date = new Date(ts);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

/**
 * Classifica o tipo de continuação baseado no volume.
 */
function classifyContinuation(volumeRatio: number): ContinuationType | null {
  if (volumeRatio >= VOLUME_CONFIRMED_THRESHOLD) {
    return "CONFIRMED";
  }
  if (volumeRatio >= VOLUME_EARLY_THRESHOLD) {
    return "EARLY";
  }
  return null;
}

// ─── Função principal ────────────────────────────────────────

/**
 * Gera intent de Momentum Two-Speed.
 *
 * Detecta continuação de tendência em dois modos:
 * - Early: volume moderado, risco reduzido
 * - Confirmed: volume forte, risco normal
 *
 * @returns BrainIntent se houver edge, null caso contrário
 */
export function generateIntent(input: BrainInput): BrainIntent | null {
  const { mcl } = input;
  const states = mcl.market_states;

  // ─── Gate checks (regras duras) ────────────────────────────

  // Só opera em TREND
  if (states.structure !== MarketStructure.TREND) {
    return null;
  }

  // Só opera com liquidez CLEAN
  if (states.liquidity_phase !== LiquidityPhase.CLEAN) {
    return null;
  }

  // Só opera com execução OK
  if (mcl.execution_state !== ExecutionHealth.OK) {
    return null;
  }

  // ─── Detecção de edge ──────────────────────────────────────

  const atr = mcl.metrics.atr;
  if (atr <= 0) {
    return null;
  }

  // Spread muito alto invalida momentum entry
  if (mcl.metrics.spread_bps > MAX_SLIPPAGE_BPS * 2) {
    return null;
  }

  // Classificar tipo de continuação
  const continuationType = classifyContinuation(mcl.metrics.volume_ratio);
  if (continuationType === null) {
    return null;
  }

  // Em volatilidade alta, só aceita confirmed (mais seguro)
  if (
    states.volatility === VolatilityLevel.HIGH &&
    continuationType === "EARLY"
  ) {
    return null;
  }

  // ─── Construção do intent ──────────────────────────────────

  // Direção: em TREND, seguimos a correlação como proxy de direção
  // correlação positiva → tendência de alta → LONG
  // correlação negativa → tendência de baixa → SHORT
  const isLong = mcl.metrics.correlation_index >= 0;
  const intentType = isLong ? "OPEN_LONG" : "OPEN_SHORT";

  const isConfirmed = continuationType === "CONFIRMED";
  const riskPct = isConfirmed ? RISK_CONFIRMED_PCT : RISK_EARLY_PCT;
  const tpMultiplier = isConfirmed
    ? TP_ATR_MULTIPLIER_CONFIRMED
    : TP_ATR_MULTIPLIER_EARLY;

  const stopDistance = atr * SL_ATR_MULTIPLIER;
  const profitDistance = atr * tpMultiplier;
  const refPrice = atr * 50;

  const entryPrice = refPrice;
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

  const label = isConfirmed ? "confirmed" : "early";
  const message = `C3 detectou ${label} continuation em ${input.symbol} — momentum ${intentType} com volume ratio ${mcl.metrics.volume_ratio.toFixed(2)}`;

  return {
    event_id: input.event_id,
    correlation_id: input.correlation_id,
    timestamp: input.timestamp,
    severity: Severity.INFO,
    brain_id: BrainId.C3,
    symbol: input.symbol,
    intent_type: intentType,
    proposed_risk_pct: riskPct,
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
      reason_code: ReasonCode.MCL_STRUCTURE_CHANGE,
      message,
    },
  };
}
