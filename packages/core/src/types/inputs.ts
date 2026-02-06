// ═════════════════════════════════════════════════════════════
// @schimidt-brain/core — Tipos de Input
// Tipos locais que definem o que o core recebe de fora.
// Nenhum I/O aqui — apenas shapes de dados.
// ═════════════════════════════════════════════════════════════

import type {
  MarketSessionType,
  EventProximityType,
  ExecutionHealthType,
  GlobalModeType,
  BrainIdType,
  Timestamp,
  MclSnapshot,
  BrainIntent,
  RiskState,
} from "@schimidt-brain/contracts";

// ─── MCL Input ───────────────────────────────────────────────

/**
 * Candle OHLC pré-agregado.
 * Fornecido externamente — MCL não calcula candles.
 */
export interface OhlcBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly timestamp: Timestamp;
}

/**
 * Conjunto de candles por timeframe.
 * Cada array deve conter pelo menos 1 candle.
 */
export interface OhlcSet {
  readonly D1: readonly OhlcBar[];
  readonly H4: readonly OhlcBar[];
  readonly H1: readonly OhlcBar[];
  readonly M15: readonly OhlcBar[];
}

/**
 * Métricas pré-calculadas fornecidas externamente.
 * O core NÃO calcula ATR, overlap, etc. — recebe pronto.
 */
export interface PrecomputedMetrics {
  readonly atr: number;
  readonly spread_bps: number;
  readonly volume_ratio: number;
  readonly correlation_index: number;
  /** Percentual de overlap entre sessões (0-1) */
  readonly session_overlap: number;
  /** Fator de expansão de range (ratio vs média) */
  readonly range_expansion: number;
}

/**
 * Estado de execução pré-calculado externamente.
 */
export interface ExecutionContext {
  readonly health: ExecutionHealthType;
  readonly latency_ms: number;
  readonly last_spread_bps: number;
  readonly last_slippage_bps: number;
}

/**
 * Input completo para computeMarketContext.
 */
export interface MclInput {
  readonly symbol: string;
  readonly timestamp: Timestamp;
  readonly ohlc: OhlcSet;
  readonly metrics: PrecomputedMetrics;
  readonly session: MarketSessionType;
  readonly event_state: EventProximityType;
  readonly execution: ExecutionContext;
  readonly global_mode: GlobalModeType;
  /** IDs injetados externamente — funções puras não geram UUIDs */
  readonly event_id: string;
  readonly correlation_id: string;
}

// ─── Brain Input ─────────────────────────────────────────────

/**
 * Input para cada brain — recebe o snapshot MCL + contexto adicional.
 */
export interface BrainInput {
  readonly mcl: MclSnapshot;
  readonly symbol: string;
  readonly timestamp: Timestamp;
  /** IDs injetados externamente */
  readonly event_id: string;
  readonly correlation_id: string;
}

// ─── Portfolio Manager Input ─────────────────────────────────

/**
 * Limites de risco configuráveis.
 */
export interface RiskLimits {
  readonly max_drawdown_pct: number;
  readonly max_exposure_pct: number;
  readonly max_daily_loss_pct: number;
  readonly max_positions: number;
  readonly max_exposure_per_symbol_pct: number;
  readonly max_exposure_per_currency_pct: number;
  readonly max_correlated_exposure_pct: number;
}

/**
 * Posição aberta existente no portfólio.
 */
export interface OpenPosition {
  readonly symbol: string;
  readonly brain_id: BrainIdType;
  readonly direction: "LONG" | "SHORT";
  readonly risk_pct: number;
  readonly entry_price: number;
  readonly current_price: number;
  readonly unrealized_pnl_pct: number;
}

/**
 * Estado completo do portfólio.
 */
export interface PortfolioState {
  readonly risk_state: RiskState;
  readonly positions: readonly OpenPosition[];
  readonly risk_limits: RiskLimits;
  readonly global_mode: GlobalModeType;
  /** Brains atualmente em cooldown */
  readonly cooldowns: readonly CooldownEntry[];
}

/**
 * Entrada de cooldown ativa.
 */
export interface CooldownEntry {
  readonly scope: "BRAIN" | "SYMBOL" | "GLOBAL";
  readonly target: string;
  readonly until: Timestamp;
}

/**
 * Input para o Portfolio Manager.
 */
export interface PmInput {
  readonly intent: BrainIntent;
  readonly portfolio: PortfolioState;
  readonly timestamp: Timestamp;
  /** IDs injetados externamente */
  readonly event_id: string;
  readonly correlation_id: string;
}

// ─── EHM Input ───────────────────────────────────────────────

/**
 * Resultado de uma posição (para análise de streak).
 */
export interface PositionResult {
  readonly symbol: string;
  readonly brain_id: BrainIdType;
  readonly pnl_pct: number;
  readonly closed_at: Timestamp;
  readonly duration_minutes: number;
}

/**
 * Estado de uma posição ativa para avaliação do EHM.
 */
export interface ActivePositionState {
  readonly symbol: string;
  readonly brain_id: BrainIdType;
  readonly direction: "LONG" | "SHORT";
  readonly entry_price: number;
  readonly current_price: number;
  readonly stop_loss: number;
  readonly take_profit: number;
  readonly unrealized_pnl_pct: number;
  readonly duration_minutes: number;
  readonly max_favorable_pct: number;
  readonly max_adverse_pct: number;
}

/**
 * Input para o Edge Health Monitor.
 */
export interface EhmInput {
  readonly position: ActivePositionState;
  readonly recent_results: readonly PositionResult[];
  readonly mcl: MclSnapshot;
  readonly timestamp: Timestamp;
  /** IDs injetados externamente */
  readonly event_id: string;
  readonly correlation_id: string;
}
