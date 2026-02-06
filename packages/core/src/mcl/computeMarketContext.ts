// ═════════════════════════════════════════════════════════════
// Market Context Layer (MCL)
// Função pura: recebe dados → retorna MCL_SNAPSHOT
// NÃO decide estratégia, NÃO decide trade, NÃO sabe de brains.
// ═════════════════════════════════════════════════════════════

import {
  MarketStructure,
  VolatilityLevel,
  LiquidityPhase,
  ExecutionHealth,
  Severity,
  ReasonCode,
} from "@schimidt-brain/contracts";

import type { MclSnapshot } from "@schimidt-brain/contracts";
import type { MclInput, OhlcBar } from "../types/inputs";

// ─── Constantes determinísticas ──────────────────────────────

/** Limiar de ATR para considerar volatilidade alta (ratio vs preço) */
const ATR_HIGH_THRESHOLD = 0.02;
/** Limiar de ATR para considerar volatilidade baixa */
const ATR_LOW_THRESHOLD = 0.005;
/** Limiar de volume ratio para confirmar tendência */
const VOLUME_TREND_THRESHOLD = 1.2;
/** Limiar de range expansion para transição */
const RANGE_EXPANSION_TRANSITION = 1.5;
/** Limiar de spread para considerar execução degradada */
const SPREAD_DEGRADED_BPS = 30;

// ─── Helpers puros ───────────────────────────────────────────

/**
 * Determina a estrutura de mercado a partir dos candles H1.
 * Analisa higher-highs/higher-lows ou lower-highs/lower-lows.
 */
function classifyStructure(
  h1Bars: readonly OhlcBar[],
  rangeExpansion: number,
  volumeRatio: number
): MarketStructure {
  if (h1Bars.length < 3) {
    return MarketStructure.RANGE;
  }

  // Pegar últimos 3 candles para análise de estrutura
  const recent = h1Bars.slice(-3);
  const highs = recent.map((b) => b.high);
  const lows = recent.map((b) => b.low);

  const isHigherHighs = highs[2] > highs[1] && highs[1] > highs[0];
  const isHigherLows = lows[2] > lows[1] && lows[1] > lows[0];
  const isLowerHighs = highs[2] < highs[1] && highs[1] < highs[0];
  const isLowerLows = lows[2] < lows[1] && lows[1] < lows[0];

  const isTrending =
    (isHigherHighs && isHigherLows) || (isLowerHighs && isLowerLows);

  if (isTrending && volumeRatio >= VOLUME_TREND_THRESHOLD) {
    return MarketStructure.TREND;
  }

  if (rangeExpansion >= RANGE_EXPANSION_TRANSITION) {
    return MarketStructure.TRANSITION;
  }

  if (isTrending) {
    return MarketStructure.TRANSITION;
  }

  return MarketStructure.RANGE;
}

/**
 * Classifica o nível de volatilidade baseado no ATR normalizado.
 */
function classifyVolatility(
  atr: number,
  referencePrice: number
): VolatilityLevel {
  if (referencePrice <= 0) {
    return VolatilityLevel.NORMAL;
  }

  const normalizedAtr = atr / referencePrice;

  if (normalizedAtr >= ATR_HIGH_THRESHOLD) {
    return VolatilityLevel.HIGH;
  }
  if (normalizedAtr <= ATR_LOW_THRESHOLD) {
    return VolatilityLevel.LOW;
  }
  return VolatilityLevel.NORMAL;
}

/**
 * Classifica a fase de liquidez baseada em volume e estrutura de preço.
 */
function classifyLiquidity(
  m15Bars: readonly OhlcBar[],
  volumeRatio: number,
  sessionOverlap: number
): LiquidityPhase {
  if (m15Bars.length < 2) {
    return LiquidityPhase.CLEAN;
  }

  const lastBar = m15Bars[m15Bars.length - 1];
  const prevBar = m15Bars[m15Bars.length - 2];

  // Wick ratio: se as sombras são grandes vs corpo → possível raid
  const lastBody = Math.abs(lastBar.close - lastBar.open);
  const lastRange = lastBar.high - lastBar.low;
  const wickRatio = lastRange > 0 ? lastBody / lastRange : 1;

  // Raid: grande wick + volume alto + overlap baixo
  if (wickRatio < 0.3 && volumeRatio > 1.5 && sessionOverlap < 0.5) {
    return LiquidityPhase.RAID;
  }

  // Buildup: volume baixo + range comprimido + overlap alto
  const prevRange = prevBar.high - prevBar.low;
  const rangeCompression = prevRange > 0 ? lastRange / prevRange : 1;

  if (rangeCompression < 0.6 && volumeRatio < 0.8 && sessionOverlap > 0.3) {
    return LiquidityPhase.BUILDUP;
  }

  return LiquidityPhase.CLEAN;
}

/**
 * Determina o reason code principal para o snapshot MCL.
 */
function determineReasonCode(
  _structure: MarketStructure,
  volatility: VolatilityLevel,
  liquidity: LiquidityPhase,
  eventState: string
): ReasonCode {
  // Prioridade: evento > volatilidade > liquidez > estrutura
  if (eventState === "PRE_EVENT" || eventState === "POST_EVENT") {
    return ReasonCode.MCL_EVENT_PROXIMITY;
  }
  if (volatility === VolatilityLevel.HIGH) {
    return ReasonCode.MCL_VOLATILITY_SPIKE;
  }
  if (volatility === VolatilityLevel.LOW) {
    return ReasonCode.MCL_VOLATILITY_DROP;
  }
  if (liquidity === LiquidityPhase.RAID) {
    return ReasonCode.MCL_LIQUIDITY_RAID;
  }
  if (liquidity === LiquidityPhase.BUILDUP) {
    return ReasonCode.MCL_LIQUIDITY_BUILDUP;
  }
  if (liquidity === LiquidityPhase.CLEAN) {
    return ReasonCode.MCL_LIQUIDITY_CLEAN;
  }
  return ReasonCode.MCL_STRUCTURE_CHANGE;
}

/**
 * Gera mensagem humana descritiva para o bloco why.
 */
function buildWhyMessage(
  structure: MarketStructure,
  volatility: VolatilityLevel,
  liquidity: LiquidityPhase,
  session: string,
  eventState: string,
  executionHealth: string
): string {
  const parts: string[] = [];

  parts.push(`Estrutura: ${structure}`);
  parts.push(`Volatilidade: ${volatility}`);
  parts.push(`Liquidez: ${liquidity}`);
  parts.push(`Sessão: ${session}`);

  if (eventState !== "NONE") {
    parts.push(`Evento: ${eventState}`);
  }
  if (executionHealth !== "OK") {
    parts.push(`Execução: ${executionHealth}`);
  }

  return parts.join(" | ");
}

/**
 * Determina severidade do snapshot baseado no contexto.
 */
function determineSeverity(
  volatility: VolatilityLevel,
  executionHealth: ExecutionHealth,
  eventState: string
): Severity {
  if (executionHealth === ExecutionHealth.BROKEN) {
    return Severity.ERROR;
  }
  if (
    volatility === VolatilityLevel.HIGH ||
    executionHealth === ExecutionHealth.DEGRADED ||
    eventState === "PRE_EVENT"
  ) {
    return Severity.WARN;
  }
  return Severity.INFO;
}

// ─── Função principal ────────────────────────────────────────

/**
 * Computa o Market Context Snapshot.
 *
 * Função PURA:
 * - Sem Date.now(), sem random, sem I/O
 * - IDs e timestamp injetados via input
 * - Retorna MclSnapshot compatível com contracts
 *
 * @param input - Dados de mercado pré-processados
 * @returns MclSnapshot válido segundo MclSnapshotSchema
 */
export function computeMarketContext(input: MclInput): MclSnapshot {
  // Preço de referência: último close do H1
  const h1Bars = input.ohlc.H1;
  const referencePrice =
    h1Bars.length > 0 ? h1Bars[h1Bars.length - 1].close : 0;

  // Classificar estados discretos
  const structure = classifyStructure(
    h1Bars,
    input.metrics.range_expansion,
    input.metrics.volume_ratio
  );

  const volatility = classifyVolatility(input.metrics.atr, referencePrice);

  const liquidity = classifyLiquidity(
    input.ohlc.M15,
    input.metrics.volume_ratio,
    input.metrics.session_overlap
  );

  // Mapear execution health
  const executionState: ExecutionHealth =
    input.execution.health === ExecutionHealth.BROKEN
      ? ExecutionHealth.BROKEN
      : input.execution.last_spread_bps > SPREAD_DEGRADED_BPS
        ? ExecutionHealth.DEGRADED
        : input.execution.health;

  // Determinar reason code e mensagem
  const reasonCode = determineReasonCode(
    structure,
    volatility,
    liquidity,
    input.event_state
  );

  const message = buildWhyMessage(
    structure,
    volatility,
    liquidity,
    input.session,
    input.event_state,
    executionState
  );

  const severity = determineSeverity(
    volatility,
    executionState,
    input.event_state
  );

  return {
    event_id: input.event_id,
    correlation_id: input.correlation_id,
    timestamp: input.timestamp,
    severity,
    symbol: input.symbol,
    global_mode: input.global_mode,
    market_states: {
      structure,
      volatility,
      liquidity_phase: liquidity,
      session: input.session,
      event_proximity: input.event_state,
    },
    metrics: {
      atr: input.metrics.atr,
      spread_bps: input.metrics.spread_bps,
      volume_ratio: input.metrics.volume_ratio,
      correlation_index: input.metrics.correlation_index,
    },
    execution_state: executionState,
    why: {
      reason_code: reasonCode,
      message,
    },
  };
}
