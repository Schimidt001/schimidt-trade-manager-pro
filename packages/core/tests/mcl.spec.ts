// ═════════════════════════════════════════════════════════════
// MCL Tests — Market Context Layer
// Prova que MCL gera estados coerentes.
// ═════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { computeMarketContext } from "../src/mcl/computeMarketContext";
import {
  MclSnapshotSchema,
  MarketStructure,
  VolatilityLevel,
  LiquidityPhase,
  EventProximity,
  ExecutionHealth,
  Severity,
} from "@schimidt-brain/contracts";
import {
  makeMclInput,
  makeTrendingH1Bars,
  makeRangingH1Bars,
  makeOhlcBar,
  makeOhlcSet,
  makeMetrics,
  makeExecutionContext,
} from "./helpers";

describe("computeMarketContext", () => {
  it("deve retornar um MclSnapshot válido segundo o schema", () => {
    const input = makeMclInput();
    const result = computeMarketContext(input);
    const validation = MclSnapshotSchema.safeParse(result);
    expect(validation.success).toBe(true);
  });

  it("deve preservar symbol, event_id, correlation_id e timestamp", () => {
    const input = makeMclInput({ symbol: "GBPUSD" });
    const result = computeMarketContext(input);
    expect(result.symbol).toBe("GBPUSD");
    expect(result.event_id).toBe(input.event_id);
    expect(result.correlation_id).toBe(input.correlation_id);
    expect(result.timestamp).toBe(input.timestamp);
  });

  it("deve classificar TREND quando H1 mostra higher-highs/higher-lows com volume", () => {
    const input = makeMclInput({
      ohlc: makeOhlcSet({ H1: makeTrendingH1Bars() }),
      metrics: makeMetrics({ volume_ratio: 1.3 }),
    });
    const result = computeMarketContext(input);
    expect(result.market_states.structure).toBe(MarketStructure.TREND);
  });

  it("deve classificar RANGE quando H1 não mostra tendência clara", () => {
    const input = makeMclInput({
      ohlc: makeOhlcSet({ H1: makeRangingH1Bars() }),
      metrics: makeMetrics({ volume_ratio: 0.8, range_expansion: 0.9 }),
    });
    const result = computeMarketContext(input);
    expect(result.market_states.structure).toBe(MarketStructure.RANGE);
  });

  it("deve classificar volatilidade HIGH quando ATR normalizado é alto", () => {
    // ATR = 0.03, preço referência ~1.1 → normalizado = 0.027 > 0.02
    const input = makeMclInput({
      metrics: makeMetrics({ atr: 0.03 }),
    });
    const result = computeMarketContext(input);
    expect(result.market_states.volatility).toBe(VolatilityLevel.HIGH);
  });

  it("deve classificar volatilidade LOW quando ATR normalizado é baixo", () => {
    // ATR = 0.003, preço referência ~1.1 → normalizado = 0.0027 < 0.005
    const input = makeMclInput({
      metrics: makeMetrics({ atr: 0.003 }),
    });
    const result = computeMarketContext(input);
    expect(result.market_states.volatility).toBe(VolatilityLevel.LOW);
  });

  it("deve classificar volatilidade NORMAL para ATR médio", () => {
    const input = makeMclInput({
      metrics: makeMetrics({ atr: 0.008 }),
    });
    const result = computeMarketContext(input);
    expect(result.market_states.volatility).toBe(VolatilityLevel.NORMAL);
  });

  it("deve propagar event_proximity do input", () => {
    const input = makeMclInput({ event_state: EventProximity.PRE_EVENT });
    const result = computeMarketContext(input);
    expect(result.market_states.event_proximity).toBe(EventProximity.PRE_EVENT);
  });

  it("deve propagar session do input", () => {
    const input = makeMclInput({ session: "NY" as any });
    const result = computeMarketContext(input);
    expect(result.market_states.session).toBe("NY");
  });

  it("deve retornar execution_state DEGRADED quando spread é alto", () => {
    const input = makeMclInput({
      execution: makeExecutionContext({ last_spread_bps: 50 }),
    });
    const result = computeMarketContext(input);
    expect(result.execution_state).toBe(ExecutionHealth.DEGRADED);
  });

  it("deve retornar execution_state BROKEN quando health é BROKEN", () => {
    const input = makeMclInput({
      execution: makeExecutionContext({ health: ExecutionHealth.BROKEN }),
    });
    const result = computeMarketContext(input);
    expect(result.execution_state).toBe(ExecutionHealth.BROKEN);
  });

  it("deve retornar severity WARN para volatilidade alta", () => {
    const input = makeMclInput({
      metrics: makeMetrics({ atr: 0.03 }),
    });
    const result = computeMarketContext(input);
    expect(result.severity).toBe(Severity.WARN);
  });

  it("deve retornar severity ERROR para execução BROKEN", () => {
    const input = makeMclInput({
      execution: makeExecutionContext({ health: ExecutionHealth.BROKEN }),
    });
    const result = computeMarketContext(input);
    expect(result.severity).toBe(Severity.ERROR);
  });

  it("deve retornar severity INFO em condições normais", () => {
    const input = makeMclInput();
    const result = computeMarketContext(input);
    expect(result.severity).toBe(Severity.INFO);
  });

  it("deve incluir bloco why com reason_code e message não vazios", () => {
    const input = makeMclInput();
    const result = computeMarketContext(input);
    expect(result.why.reason_code).toBeDefined();
    expect(result.why.message.length).toBeGreaterThan(0);
  });

  it("deve propagar métricas do input para o output", () => {
    const input = makeMclInput({
      metrics: makeMetrics({ atr: 0.012, spread_bps: 8, volume_ratio: 1.5, correlation_index: -0.3 }),
    });
    const result = computeMarketContext(input);
    expect(result.metrics.atr).toBe(0.012);
    expect(result.metrics.spread_bps).toBe(8);
    expect(result.metrics.volume_ratio).toBe(1.5);
    expect(result.metrics.correlation_index).toBe(-0.3);
  });

  it("deve classificar BUILDUP com range comprimido e volume baixo", () => {
    const m15Bars = [
      makeOhlcBar({ open: 1.1000, high: 1.1050, low: 1.0950, close: 1.1020 }),
      makeOhlcBar({ open: 1.1020, high: 1.1030, low: 1.1010, close: 1.1025 }),
    ];
    const input = makeMclInput({
      ohlc: makeOhlcSet({ M15: m15Bars }),
      metrics: makeMetrics({ volume_ratio: 0.6, session_overlap: 0.5 }),
    });
    const result = computeMarketContext(input);
    expect(result.market_states.liquidity_phase).toBe(LiquidityPhase.BUILDUP);
  });

  it("deve propagar global_mode do input", () => {
    const input = makeMclInput({ global_mode: "RISK_OFF" as any });
    const result = computeMarketContext(input);
    expect(result.global_mode).toBe("RISK_OFF");
  });
});
