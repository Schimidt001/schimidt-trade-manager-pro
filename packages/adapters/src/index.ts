// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Ponto de Entrada Público
// ═════════════════════════════════════════════════════════════
// Este arquivo exporta todas as interfaces e funções públicas
// do pacote adapters para consumo pela API (Agente 4) e outros
// pacotes do Schimidt Brain.
// ═════════════════════════════════════════════════════════════

// ─── Types (modelos normalizados) ───────────────────────────
export type {
  EconomicEventNormalized,
  EventWindow,
  EventWindowPolicy,
  ImpactLevel,
  DataSource,
  ProviderState,
  ProviderHealthResult,
  CalendarServiceResponse,
  TradingEconomicsRawEvent,
  FinnhubRawEvent,
  FinnhubCalendarResponse,
} from "./news/types";

// ─── Calendar Service (interface principal para a API) ──────
export {
  getDayCalendar,
  getNextHighImpactEvent,
  computeEventWindows,
} from "./news/calendarService";

// ─── Provider Health ────────────────────────────────────────
export {
  evaluateProviderHealth,
  shouldDisableD2,
} from "./news/providerHealth";

// ─── Normalização (utilitários) ─────────────────────────────
export {
  generateDeterministicId,
  toUtcMinus3,
  mapTeImportance,
  mapFinnhubImpact,
  parseNumericValue,
  normalizeTradingEconomicsEvent,
  normalizeFinnhubEvent,
  sortEventsByTimestamp,
} from "./news/normalize";

// ─── Providers individuais (para uso direto se necessário) ──
export { fetchCalendarDay as fetchTradingEconomicsCalendar } from "./news/tradingEconomics";
export { fetchCalendarDay as fetchFinnhubCalendar } from "./news/finnhub";

// ═════════════════════════════════════════════════════════════
// Executor Adapter (Agente 6)
// ═════════════════════════════════════════════════════════════

// ─── Executor Types ─────────────────────────────────────────
export type {
  ExecutionState,
  ExecutorRiskProfile,
  ExecutorHealthMetrics,
  ExecutorStatus,
  ExecutorCommandType,
  ExecutorCommand,
  ExecutorCommandResult,
  ExecutorEventType,
  ExecutorEvent,
  IExecutorAdapter,
  SimulatorMode,
} from "./executor/types";

// ─── Executor Adapter (real) ────────────────────────────────
export { ExecutorAdapter } from "./executor/executorAdapter";

// ─── Executor Simulator ─────────────────────────────────────
export { ExecutorSimulator } from "./executor/executorSimulator";

// ─── Mapping PM → Executor Commands ─────────────────────────
export {
  mapDecisionToExecutorCommands,
  createNotSupportedEntry,
} from "./executor/mapping";
export type {
  MappingDecision,
  MappingIntent,
  MappingEhmAction,
  MappingConfig,
} from "./executor/mapping";

// ═════════════════════════════════════════════════════════════
// Market Data Provider (FOREX Real)
// ═════════════════════════════════════════════════════════════

// ─── Market Data Types ──────────────────────────────────────
export type {
  RawOhlcCandle,
  MarketTimeframe,
  FetchResult,
  MarketDataSnapshot,
  ComputedMetrics,
  SessionName,
  RealMclInput,
} from "./market/index";

export {
  TYPICAL_SPREADS_BPS,
  DEFAULT_SPREAD_BPS,
  SYMBOL_TO_YAHOO,
} from "./market/index";

// ─── Market Data Fetch ──────────────────────────────────────
export {
  fetchMarketData,
  fetchMultipleMarketData,
} from "./market/index";

// ─── Market Metrics Computation ─────────────────────────────
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
} from "./market/index";

// ─── Build Real MCL Input ───────────────────────────────────
export { buildRealMclInput } from "./market/index";
