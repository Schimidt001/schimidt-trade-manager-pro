// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Market Data Module
// Barrel export para o módulo de dados de mercado FOREX real.
// Provider: cTrader Open API (Spotware)
// ═════════════════════════════════════════════════════════════

// ─── Types ──────────────────────────────────────────────────
export type {
  RawOhlcCandle,
  MarketTimeframe,
  TimeframeConfig,
  FetchResult,
  MarketDataSnapshot,
  DataQualityStatus,
  DataQualityResult,
} from "./types";

export {
  TYPICAL_SPREADS_BPS,
  DEFAULT_SPREAD_BPS,
  SYMBOL_TO_CTRADER,
  TIMEFRAME_TO_CTRADER_PERIOD,
} from "./types";

// ─── Fetch Candles (cTrader) ───────────────────────────────
export {
  fetchMarketData,
  fetchMultipleMarketData,
  closeCTraderConnection,
  evaluateDataQuality,
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
