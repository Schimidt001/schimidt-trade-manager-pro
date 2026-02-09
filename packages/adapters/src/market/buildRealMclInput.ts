// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Build Real MCL Input
// Constrói o MclInput a partir de dados de mercado REAIS.
//
// Esta função SUBSTITUI o buildMockMclInput() do decisionEngine.
// Recebe um MarketDataSnapshot (candles reais) e produz um
// MclInput válido para o computeMarketContext().
//
// Responsabilidades:
// - Converter RawOhlcCandle[] → OhlcBar[] (formato core)
// - Calcular métricas derivadas (ATR, spread, volume, etc.)
// - Determinar sessão de mercado por horário UTC
// - Propagar event_state e execution context
//
// Regras:
// - NÃO altera a lógica do MCL
// - NÃO altera brains
// - NÃO altera PM
// - Apenas alimenta dados reais no formato esperado
// ═════════════════════════════════════════════════════════════

import type { MarketDataSnapshot, RawOhlcCandle } from "./types";
import {
  computeAllMetrics,
  determineSessionFromTimestamp,
} from "./computeMetrics";

// ─── Tipos re-exportados do core (para evitar dependência circular) ─

/**
 * OhlcBar compatível com @schimidt-brain/core.
 * Replicado aqui para evitar dependência direta do core no adapters.
 */
interface OhlcBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly timestamp: string; // ISO 8601
}

interface OhlcSet {
  readonly D1: readonly OhlcBar[];
  readonly H4: readonly OhlcBar[];
  readonly H1: readonly OhlcBar[];
  readonly M15: readonly OhlcBar[];
}

interface PrecomputedMetrics {
  readonly atr: number;
  readonly spread_bps: number;
  readonly volume_ratio: number;
  readonly correlation_index: number;
  readonly session_overlap: number;
  readonly range_expansion: number;
}

interface ExecutionContext {
  readonly health: string;
  readonly latency_ms: number;
  readonly last_spread_bps: number;
  readonly last_slippage_bps: number;
}

/**
 * MclInput compatível com @schimidt-brain/core.
 * Replicado aqui para evitar dependência circular.
 */
export interface RealMclInput {
  readonly symbol: string;
  readonly timestamp: string;
  readonly ohlc: OhlcSet;
  readonly metrics: PrecomputedMetrics;
  readonly session: string;
  readonly event_state: string;
  readonly execution: ExecutionContext;
  readonly global_mode: string;
  readonly event_id: string;
  readonly correlation_id: string;
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Converte um RawOhlcCandle (timestamp Unix) para OhlcBar (timestamp ISO).
 */
function rawToOhlcBar(raw: RawOhlcCandle): OhlcBar {
  return {
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    volume: raw.volume,
    timestamp: new Date(raw.timestamp * 1000).toISOString(),
  };
}

/**
 * Converte um array de RawOhlcCandle para OhlcBar[].
 * Retorna os últimos N candles para manter o tamanho controlado.
 */
function convertCandles(
  raws: readonly RawOhlcCandle[],
  maxBars: number
): OhlcBar[] {
  const recent = raws.slice(-maxBars);
  return recent.map(rawToOhlcBar);
}

// ─── Função Principal ───────────────────────────────────────

/**
 * Constrói um MclInput real a partir de dados de mercado FOREX.
 *
 * @param snapshot - Dados de mercado completos (candles reais)
 * @param eventId - UUID v4 do evento
 * @param correlationId - UUID v4 de correlação
 * @param timestamp - Timestamp ISO 8601 do tick
 * @param eventState - Estado de evento (NONE | PRE_EVENT | POST_EVENT)
 * @param globalMode - Modo global (NORMAL | RISK_OFF | etc.)
 * @param executionHealth - Estado de saúde da execução (OK | DEGRADED | BROKEN)
 * @returns MclInput pronto para computeMarketContext()
 */
export function buildRealMclInput(
  snapshot: MarketDataSnapshot,
  eventId: string,
  correlationId: string,
  timestamp: string,
  eventState: string = "NONE",
  globalMode: string = "NORMAL",
  executionHealth: string = "OK"
): RealMclInput {
  // Converter candles para formato OhlcBar
  const ohlc: OhlcSet = {
    D1: convertCandles(snapshot.D1, 5),
    H4: convertCandles(snapshot.H4, 6),
    H1: convertCandles(snapshot.H1, 20),
    M15: convertCandles(snapshot.M15, 10),
  };

  // Calcular métricas derivadas
  const metrics = computeAllMetrics(snapshot, timestamp);

  // Determinar sessão de mercado
  const session = determineSessionFromTimestamp(timestamp);

  // Construir execution context
  const execution: ExecutionContext = {
    health: executionHealth,
    latency_ms: 50,
    last_spread_bps: metrics.spread_bps,
    last_slippage_bps: 1,
  };

  return {
    symbol: snapshot.symbol,
    timestamp,
    ohlc,
    metrics,
    session,
    event_state: eventState,
    execution,
    global_mode: globalMode,
    event_id: eventId,
    correlation_id: correlationId,
  };
}
