// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Market Data Module
// Barrel export para o módulo de dados de mercado FOREX real.
// ═════════════════════════════════════════════════════════════

// ─── Types ──────────────────────────────────────────────────
export type {
  RawOhlcCandle,
  MarketTimeframe,
  TimeframeConfig,
  FetchResult,
  MarketDataSnapshot,
} from "./types";

export {
  TYPICAL_SPREADS_BPS,
  DEFAULT_SPREAD_BPS,
  SYMBOL_TO_YAHOO,
} from "./types";

// ─── Fetch Candles ──────────────────────────────────────────
export {
  fetchMarketData,
  fetchMultipleMarketData,
} from "./fetchCandles";

// ─── Compute Metrics ────────────────────────────────────────
export {
  computeATR,
  determineSession,
  computeSessionOverlap,
  computeSpreadProxy,
  computeVolumeRatio,
  computeCorrelationIndex,
  computeRangeExpansion,
  computeAllMetrics,
  determineSessionFromTimestamp,
} from "./computeMetrics";
export type { ComputedMetrics, SessionName } from "./computeMetrics";

// ─── Build Real MCL Input ───────────────────────────────────
export { buildRealMclInput } from "./buildRealMclInput";
export type { RealMclInput } from "./buildRealMclInput";
