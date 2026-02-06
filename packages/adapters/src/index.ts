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
