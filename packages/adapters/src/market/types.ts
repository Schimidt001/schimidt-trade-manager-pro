// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Market Data Types
// Tipos para o provider de dados de mercado FOREX real.
// Provider: cTrader Open API (Spotware)
// ═════════════════════════════════════════════════════════════

// ─── Raw OHLC Candle ────────────────────────────────────────

/**
 * Candle OHLC bruto retornado pelo provider.
 */
export interface RawOhlcCandle {
  readonly timestamp: number; // Unix timestamp (seconds)
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

// ─── Timeframe ──────────────────────────────────────────────

/**
 * Timeframes suportados pelo provider.
 */
export type MarketTimeframe = "M15" | "H1" | "H4" | "D1";

// ─── Provider Config ────────────────────────────────────────

/**
 * Mapeamento de timeframe para parâmetros do provider.
 */
export interface TimeframeConfig {
  readonly interval: string;  // Intervalo da API (ex: "15m", "60m", "1d")
  readonly range: string;     // Range de dados (ex: "5d", "1mo")
  readonly minBars: number;   // Mínimo de candles necessários
}

// ─── Fetch Result ───────────────────────────────────────────

/**
 * Resultado de um fetch de candles para um símbolo/timeframe.
 */
export interface FetchResult {
  readonly symbol: string;
  readonly timeframe: MarketTimeframe;
  readonly candles: readonly RawOhlcCandle[];
  readonly fetchedAt: string; // ISO 8601
}

// ─── Market Data Snapshot ───────────────────────────────────

/**
 * Snapshot completo de dados de mercado para um símbolo.
 * Contém candles de todos os timeframes necessários.
 */
export interface MarketDataSnapshot {
  readonly symbol: string;
  readonly fetchedAt: string; // ISO 8601
  readonly D1: readonly RawOhlcCandle[];
  readonly H4: readonly RawOhlcCandle[];
  readonly H1: readonly RawOhlcCandle[];
  readonly M15: readonly RawOhlcCandle[];
}

// ─── Spread Proxy Table ─────────────────────────────────────

/**
 * Tabela de spreads típicos por par FOREX (em basis points).
 * Valores baseados em condições normais de mercado para majors.
 */
export const TYPICAL_SPREADS_BPS: Readonly<Record<string, number>> = {
  EURUSD: 3,
  GBPUSD: 5,
  USDJPY: 4,
  AUDUSD: 5,
  USDCHF: 5,
  USDCAD: 5,
  NZDUSD: 6,
};

/** Spread default para pares não mapeados */
export const DEFAULT_SPREAD_BPS = 8;

// ─── Symbol Mapping (cTrader) ──────────────────────────────

/**
 * Mapeamento de símbolo interno para nome do símbolo no cTrader.
 * Os symbolIds numéricos são resolvidos dinamicamente via
 * ProtoOASymbolsListReq na primeira conexão.
 */
export const SYMBOL_TO_CTRADER: Readonly<Record<string, string>> = {
  EURUSD: "EURUSD",
  GBPUSD: "GBPUSD",
  USDJPY: "USDJPY",
  AUDUSD: "AUDUSD",
  USDCHF: "USDCHF",
  USDCAD: "USDCAD",
  NZDUSD: "NZDUSD",
};

// ─── cTrader Trendbar Period Mapping ────────────────────────

/**
 * Mapeamento de MarketTimeframe para ProtoOATrendbarPeriod (enum numérico).
 * Conforme proto: M1=1, M2=2, M3=3, M4=4, M5=5, M10=6, M15=7, M30=8,
 * H1=9, H4=10, H12=11, D1=12, W1=13, MN1=14
 */
export const TIMEFRAME_TO_CTRADER_PERIOD: Readonly<Record<MarketTimeframe, number>> = {
  M15: 7,
  H1: 9,
  H4: 10,
  D1: 12,
};

// ─── Data Quality ──────────────────────────────────────────

/**
 * Estado de qualidade dos dados de mercado.
 * Usado pelo Data Quality Gate para sinalizar problemas.
 */
export type DataQualityStatus = "OK" | "DEGRADED" | "DOWN" | "MARKET_CLOSED";

/**
 * Resultado do Data Quality Gate.
 */
export interface DataQualityResult {
  readonly status: DataQualityStatus;
  readonly reason: string;
  readonly gaps_detected: boolean;
  readonly stale_data: boolean;
  readonly market_closed: boolean;
  readonly volume_missing: boolean;
}
