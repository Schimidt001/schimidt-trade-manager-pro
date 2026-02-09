// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Market Data Types
// Tipos para o provider de dados de mercado FOREX real.
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

// ─── Symbol Mapping ─────────────────────────────────────────

/**
 * Mapeamento de símbolo interno para símbolo do provider Yahoo Finance.
 * FOREX no Yahoo Finance usa formato "EURUSD=X".
 */
export const SYMBOL_TO_YAHOO: Readonly<Record<string, string>> = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  AUDUSD: "AUDUSD=X",
  USDCHF: "USDCHF=X",
  USDCAD: "USDCAD=X",
  NZDUSD: "NZDUSD=X",
};
