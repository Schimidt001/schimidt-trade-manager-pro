// ═════════════════════════════════════════════════════════════
// Brain A2 — Liquidity Predator
// Detecta build-up / trap e propõe entrada assimétrica.
//
// Regras duras:
// - event_state != PRE_EVENT
// - execution_state == OK
// - Não força trade
// - Não ignora contexto
// ═════════════════════════════════════════════════════════════

import {
  EventProximity,
  ExecutionHealth,
  LiquidityPhase,
  VolatilityLevel,
  Severity,
  ReasonCode,
  BrainId,
} from "@schimidt-brain/contracts";

import type { BrainIntent } from "@schimidt-brain/contracts";
import type { BrainInput } from "../types/inputs";

// ─── Constantes ──────────────────────────────────────────────

/** Risco base para A2 (percentual do capital) */
const BASE_RISK_PCT = 1.0;
/** Slippage máximo aceito em bps */
const MAX_SLIPPAGE_BPS = 15;
/** Ratio risco/retorno mínimo */
const MIN_RR_RATIO = 2.0;
/** Validade do intent em minutos */
const INTENT_VALIDITY_MINUTES = 30;
/** ATR multiplier para stop loss */
const SL_ATR_MULTIPLIER = 1.5;
/** ATR multiplier para take profit */
const TP_ATR_MULTIPLIER = 3.0;

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Adiciona minutos a um timestamp ISO 8601.
 * Função pura — sem Date.now().
 */
function addMinutesToTimestamp(ts: string, minutes: number): string {
  const date = new Date(ts);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

// ─── Função principal ────────────────────────────────────────

/**
 * Gera intent de Liquidity Predator.
 *
 * Detecta padrões de build-up (acúmulo de liquidez) seguidos de
 * possível trap, propondo entrada assimétrica na direção oposta
 * ao raid esperado.
 *
 * @returns BrainIntent se houver edge, null caso contrário
 */
export function generateIntent(input: BrainInput): BrainIntent | null {
  const { mcl } = input;
  const states = mcl.market_states;

  // ─── Gate checks (regras duras) ────────────────────────────

  // Não opera em PRE_EVENT
  if (states.event_proximity === EventProximity.PRE_EVENT) {
    return null;
  }

  // Só opera com execução OK
  if (mcl.execution_state !== ExecutionHealth.OK) {
    return null;
  }

  // Não opera em volatilidade alta (risco de whipsaw)
  if (states.volatility === VolatilityLevel.HIGH) {
    return null;
  }

  // ─── Detecção de edge ──────────────────────────────────────

  // A2 precisa de BUILDUP ou RAID para ter edge
  if (
    states.liquidity_phase !== LiquidityPhase.BUILDUP &&
    states.liquidity_phase !== LiquidityPhase.RAID
  ) {
    return null;
  }

  // Spread muito alto → sem edge
  if (mcl.metrics.spread_bps > MAX_SLIPPAGE_BPS) {
    return null;
  }

  // ─── Construção do intent ──────────────────────────────────

  const atr = mcl.metrics.atr;
  if (atr <= 0) {
    return null;
  }

  // Determinar direção baseado na fase de liquidez
  // BUILDUP → espera raid para baixo → posiciona LONG
  // RAID → trap confirmado → posiciona na direção oposta ao raid
  // Para RAID, usamos a correlação como proxy de direção:
  // correlação positiva → raid para baixo → LONG
  // correlação negativa → raid para cima → SHORT
  const isLong =
    states.liquidity_phase === LiquidityPhase.BUILDUP
      ? true
      : mcl.metrics.correlation_index >= 0;

  const intentType = isLong ? "OPEN_LONG" : "OPEN_SHORT";

  // Calcular níveis de preço baseados no ATR
  // Usamos o spread como proxy do preço atual (entry)
  // O preço real de entrada é derivado do contexto
  // Para A2, a lógica de preço é:
  // Entry = referência (último preço conhecido)
  // SL = entry -/+ ATR * multiplier
  // TP = entry +/- ATR * multiplier
  const stopDistance = atr * SL_ATR_MULTIPLIER;
  const profitDistance = atr * TP_ATR_MULTIPLIER;

  // Usar ATR como base de referência para entry price
  // O agente de execução (Agent 4) substituirá pelo preço real
  const refPrice = atr * 50; // referência escalada

  const entryPriceCalc = refPrice;
  const stopLoss = isLong
    ? entryPriceCalc - stopDistance
    : entryPriceCalc + stopDistance;
  const takeProfit = isLong
    ? entryPriceCalc + profitDistance
    : entryPriceCalc - profitDistance;

  // Validar que SL e TP são positivos
  if (stopLoss <= 0 || takeProfit <= 0 || entryPriceCalc <= 0) {
    return null;
  }

  // Verificar RR ratio
  const riskDistance = Math.abs(entryPriceCalc - stopLoss);
  const rewardDistance = Math.abs(takeProfit - entryPriceCalc);
  if (riskDistance <= 0 || rewardDistance / riskDistance < MIN_RR_RATIO - 0.001) {
    return null;
  }

  // Ajustar risco baseado na fase
  const riskPct =
    states.liquidity_phase === LiquidityPhase.RAID
      ? BASE_RISK_PCT * 0.75 // Mais conservador em raid ativo
      : BASE_RISK_PCT;

  const reasonCode =
    states.liquidity_phase === LiquidityPhase.BUILDUP
      ? ReasonCode.MCL_LIQUIDITY_BUILDUP
      : ReasonCode.MCL_LIQUIDITY_RAID;

  const message =
    states.liquidity_phase === LiquidityPhase.BUILDUP
      ? `A2 detectou build-up de liquidez em ${input.symbol} — entrada assimétrica ${intentType}`
      : `A2 detectou trap/raid em ${input.symbol} — entrada contrária ${intentType}`;

  return {
    event_id: input.event_id,
    correlation_id: input.correlation_id,
    timestamp: input.timestamp,
    severity: Severity.INFO,
    brain_id: BrainId.A2,
    symbol: input.symbol,
    intent_type: intentType,
    proposed_risk_pct: riskPct,
    trade_plan: {
      entry_price: entryPriceCalc,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      timeframe: "M15",
    },
    constraints: {
      max_slippage_bps: MAX_SLIPPAGE_BPS,
      valid_until: addMinutesToTimestamp(input.timestamp, INTENT_VALIDITY_MINUTES),
      min_rr_ratio: MIN_RR_RATIO,
    },
    why: {
      reason_code: reasonCode,
      message,
    },
  };
}
