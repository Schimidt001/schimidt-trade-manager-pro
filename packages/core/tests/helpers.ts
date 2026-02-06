// ═════════════════════════════════════════════════════════════
// Test Helpers — Fábricas de dados determinísticos
// ═════════════════════════════════════════════════════════════

import {
  MarketStructure,
  VolatilityLevel,
  LiquidityPhase,
  MarketSession,
  EventProximity,
  ExecutionHealth,
  GlobalMode,
  Severity,
  ReasonCode,
  BrainId,
} from "@schimidt-brain/contracts";

import type { MclSnapshot, BrainIntent } from "@schimidt-brain/contracts";
import type {
  MclInput,
  BrainInput,
  OhlcBar,
  OhlcSet,
  PrecomputedMetrics,
  ExecutionContext,
  PmInput,
  PortfolioState,
  RiskLimits,
  OpenPosition,
  CooldownEntry,
  EhmInput,
  ActivePositionState,
  PositionResult,
} from "../src/types/inputs";

// ─── IDs fixos para testes ───────────────────────────────────

export const TEST_EVENT_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
export const TEST_CORRELATION_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
export const TEST_TIMESTAMP = "2025-06-15T10:30:00-03:00";
export const TEST_SYMBOL = "EURUSD";

// ─── OHLC Factories ─────────────────────────────────────────

export function makeOhlcBar(overrides: Partial<OhlcBar> = {}): OhlcBar {
  return {
    open: 1.1000,
    high: 1.1050,
    low: 1.0950,
    close: 1.1020,
    volume: 1000,
    timestamp: TEST_TIMESTAMP,
    ...overrides,
  };
}

export function makeTrendingH1Bars(): OhlcBar[] {
  return [
    makeOhlcBar({ open: 1.0900, high: 1.0950, low: 1.0880, close: 1.0940 }),
    makeOhlcBar({ open: 1.0940, high: 1.1000, low: 1.0920, close: 1.0990 }),
    makeOhlcBar({ open: 1.0990, high: 1.1060, low: 1.0970, close: 1.1050 }),
  ];
}

export function makeRangingH1Bars(): OhlcBar[] {
  return [
    makeOhlcBar({ open: 1.1000, high: 1.1030, low: 1.0970, close: 1.1010 }),
    makeOhlcBar({ open: 1.1010, high: 1.1020, low: 1.0980, close: 1.0990 }),
    makeOhlcBar({ open: 1.0990, high: 1.1025, low: 1.0975, close: 1.1005 }),
  ];
}

export function makeOhlcSet(overrides: Partial<OhlcSet> = {}): OhlcSet {
  return {
    D1: [makeOhlcBar()],
    H4: [makeOhlcBar()],
    H1: makeRangingH1Bars(),
    M15: [makeOhlcBar(), makeOhlcBar()],
    ...overrides,
  };
}

// ─── Metrics Factory ─────────────────────────────────────────

export function makeMetrics(overrides: Partial<PrecomputedMetrics> = {}): PrecomputedMetrics {
  return {
    atr: 0.0080,
    spread_bps: 5,
    volume_ratio: 1.0,
    correlation_index: 0.5,
    session_overlap: 0.4,
    range_expansion: 1.0,
    ...overrides,
  };
}

// ─── Execution Context Factory ───────────────────────────────

export function makeExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    health: ExecutionHealth.OK,
    latency_ms: 50,
    last_spread_bps: 5,
    last_slippage_bps: 2,
    ...overrides,
  };
}

// ─── MCL Input Factory ──────────────────────────────────────

export function makeMclInput(overrides: Partial<MclInput> = {}): MclInput {
  return {
    symbol: TEST_SYMBOL,
    timestamp: TEST_TIMESTAMP,
    ohlc: makeOhlcSet(),
    metrics: makeMetrics(),
    session: MarketSession.LONDON,
    event_state: EventProximity.NONE,
    execution: makeExecutionContext(),
    global_mode: GlobalMode.NORMAL,
    event_id: TEST_EVENT_ID,
    correlation_id: TEST_CORRELATION_ID,
    ...overrides,
  };
}

// ─── MCL Snapshot Factory ────────────────────────────────────

export function makeMclSnapshot(overrides: Partial<MclSnapshot> = {}): MclSnapshot {
  return {
    event_id: TEST_EVENT_ID,
    correlation_id: TEST_CORRELATION_ID,
    timestamp: TEST_TIMESTAMP,
    severity: Severity.INFO,
    symbol: TEST_SYMBOL,
    global_mode: GlobalMode.NORMAL,
    market_states: {
      structure: MarketStructure.RANGE,
      volatility: VolatilityLevel.NORMAL,
      liquidity_phase: LiquidityPhase.CLEAN,
      session: MarketSession.LONDON,
      event_proximity: EventProximity.NONE,
    },
    metrics: {
      atr: 0.0080,
      spread_bps: 5,
      volume_ratio: 1.0,
      correlation_index: 0.5,
    },
    execution_state: ExecutionHealth.OK,
    why: {
      reason_code: ReasonCode.MCL_STRUCTURE_CHANGE,
      message: "Test snapshot",
    },
    ...overrides,
  };
}

// ─── Brain Input Factory ─────────────────────────────────────

export function makeBrainInput(overrides: Partial<BrainInput> = {}): BrainInput {
  return {
    mcl: makeMclSnapshot(),
    symbol: TEST_SYMBOL,
    timestamp: TEST_TIMESTAMP,
    event_id: TEST_EVENT_ID,
    correlation_id: TEST_CORRELATION_ID,
    ...overrides,
  };
}

// ─── Risk Limits Factory ─────────────────────────────────────

export function makeRiskLimits(overrides: Partial<RiskLimits> = {}): RiskLimits {
  return {
    max_drawdown_pct: 5,
    max_exposure_pct: 10,
    max_daily_loss_pct: 3,
    max_positions: 5,
    max_exposure_per_symbol_pct: 3,
    max_exposure_per_currency_pct: 6,
    max_correlated_exposure_pct: 5,
    ...overrides,
  };
}

// ─── Portfolio State Factory ─────────────────────────────────

export function makePortfolioState(overrides: Partial<PortfolioState> = {}): PortfolioState {
  return {
    risk_state: {
      current_drawdown_pct: -1.0,
      current_exposure_pct: 2.0,
      open_positions: 1,
      daily_loss_pct: -0.5,
      available_risk_pct: 8.0,
    },
    positions: [],
    risk_limits: makeRiskLimits(),
    global_mode: GlobalMode.NORMAL,
    cooldowns: [],
    ...overrides,
  };
}

// ─── Brain Intent Factory ────────────────────────────────────

export function makeBrainIntent(overrides: Partial<BrainIntent> = {}): BrainIntent {
  return {
    event_id: TEST_EVENT_ID,
    correlation_id: TEST_CORRELATION_ID,
    timestamp: TEST_TIMESTAMP,
    severity: Severity.INFO,
    brain_id: BrainId.A2,
    symbol: TEST_SYMBOL,
    intent_type: "OPEN_LONG",
    proposed_risk_pct: 1.0,
    trade_plan: {
      entry_price: 1.1000,
      stop_loss: 1.0950,
      take_profit: 1.1100,
      timeframe: "H1",
    },
    constraints: {
      max_slippage_bps: 15,
      valid_until: "2025-06-15T11:00:00-03:00",
      min_rr_ratio: 2.0,
    },
    why: {
      reason_code: ReasonCode.MCL_LIQUIDITY_BUILDUP,
      message: "Test intent",
    },
    ...overrides,
  };
}

// ─── PM Input Factory ────────────────────────────────────────

export function makePmInput(overrides: Partial<PmInput> = {}): PmInput {
  return {
    intent: makeBrainIntent(),
    portfolio: makePortfolioState(),
    timestamp: TEST_TIMESTAMP,
    event_id: TEST_EVENT_ID,
    correlation_id: TEST_CORRELATION_ID,
    ...overrides,
  };
}

// ─── Active Position State Factory ───────────────────────────

export function makeActivePosition(overrides: Partial<ActivePositionState> = {}): ActivePositionState {
  return {
    symbol: TEST_SYMBOL,
    brain_id: BrainId.A2,
    direction: "LONG",
    entry_price: 1.1000,
    current_price: 1.1010,
    stop_loss: 1.0950,
    take_profit: 1.1100,
    unrealized_pnl_pct: 0.1,
    duration_minutes: 30,
    max_favorable_pct: 0.5,
    max_adverse_pct: 0.2,
    ...overrides,
  };
}

// ─── Position Result Factory ─────────────────────────────────

export function makePositionResult(overrides: Partial<PositionResult> = {}): PositionResult {
  return {
    symbol: TEST_SYMBOL,
    brain_id: BrainId.A2,
    pnl_pct: 0.5,
    closed_at: TEST_TIMESTAMP,
    duration_minutes: 60,
    ...overrides,
  };
}

// ─── EHM Input Factory ──────────────────────────────────────

export function makeEhmInput(overrides: Partial<EhmInput> = {}): EhmInput {
  return {
    position: makeActivePosition(),
    recent_results: [],
    mcl: makeMclSnapshot(),
    timestamp: TEST_TIMESTAMP,
    event_id: TEST_EVENT_ID,
    correlation_id: TEST_CORRELATION_ID,
    ...overrides,
  };
}
