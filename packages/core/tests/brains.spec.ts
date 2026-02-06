// ═════════════════════════════════════════════════════════════
// Brains Tests
// Prova que brains não geram intent fora das condições.
// ═════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { generateA2Intent, generateB3Intent, generateC3Intent, generateD2Intent } from "../src/brains/index";
import {
  BrainIntentSchema,
  MarketStructure,
  VolatilityLevel,
  LiquidityPhase,
  EventProximity,
  ExecutionHealth,
  BrainId,
} from "@schimidt-brain/contracts";
import { makeBrainInput, makeMclSnapshot } from "./helpers";

// ─── Brain A2 — Liquidity Predator ──────────────────────────

describe("Brain A2 — Liquidity Predator", () => {
  it("deve retornar null quando event_state é PRE_EVENT", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.BUILDUP,
          session: "LONDON" as any,
          event_proximity: EventProximity.PRE_EVENT,
        },
      }),
    });
    expect(generateA2Intent(input)).toBeNull();
  });

  it("deve retornar null quando execution_state não é OK", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        execution_state: ExecutionHealth.DEGRADED,
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.BUILDUP,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
      }),
    });
    expect(generateA2Intent(input)).toBeNull();
  });

  it("deve retornar null quando volatilidade é HIGH", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.HIGH,
          liquidity_phase: LiquidityPhase.BUILDUP,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
      }),
    });
    expect(generateA2Intent(input)).toBeNull();
  });

  it("deve retornar null quando liquidity_phase é CLEAN (sem edge)", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
      }),
    });
    expect(generateA2Intent(input)).toBeNull();
  });

  it("deve gerar intent válido em BUILDUP com condições favoráveis", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.BUILDUP,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 1.0, correlation_index: 0.5 },
      }),
    });
    const result = generateA2Intent(input);
    expect(result).not.toBeNull();
    expect(result!.brain_id).toBe(BrainId.A2);
    const validation = BrainIntentSchema.safeParse(result);
    expect(validation.success).toBe(true);
  });

  it("deve gerar intent OPEN_LONG em BUILDUP", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.BUILDUP,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 1.0, correlation_index: 0.5 },
      }),
    });
    const result = generateA2Intent(input);
    expect(result).not.toBeNull();
    expect(result!.intent_type).toBe("OPEN_LONG");
  });

  it("deve retornar null quando spread é muito alto", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.BUILDUP,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 50, volume_ratio: 1.0, correlation_index: 0.5 },
      }),
    });
    expect(generateA2Intent(input)).toBeNull();
  });
});

// ─── Brain B3 — Relative Value ───────────────────────────────

describe("Brain B3 — Relative Value", () => {
  it("deve retornar null quando volatilidade é HIGH", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.HIGH,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
      }),
    });
    expect(generateB3Intent(input)).toBeNull();
  });

  it("deve retornar null quando event_state não é NONE", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.PRE_EVENT,
        },
      }),
    });
    expect(generateB3Intent(input)).toBeNull();
  });

  it("deve retornar null quando event_state é POST_EVENT", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.POST_EVENT,
        },
      }),
    });
    expect(generateB3Intent(input)).toBeNull();
  });

  it("deve retornar null quando execução está BROKEN", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        execution_state: ExecutionHealth.BROKEN,
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
      }),
    });
    expect(generateB3Intent(input)).toBeNull();
  });

  it("deve gerar intent válido com divergência de correlação", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 1.0, correlation_index: 0.1 },
      }),
    });
    const result = generateB3Intent(input);
    expect(result).not.toBeNull();
    expect(result!.brain_id).toBe(BrainId.B3);
    const validation = BrainIntentSchema.safeParse(result);
    expect(validation.success).toBe(true);
  });

  it("deve gerar HEDGE em divergência de correlação", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 1.0, correlation_index: 0.1 },
      }),
    });
    const result = generateB3Intent(input);
    expect(result).not.toBeNull();
    expect(result!.intent_type).toBe("HEDGE");
  });

  it("deve retornar null quando correlação está na zona neutra (sem edge)", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 1.0, correlation_index: 0.5 },
      }),
    });
    expect(generateB3Intent(input)).toBeNull();
  });
});

// ─── Brain C3 — Momentum Two-Speed ──────────────────────────

describe("Brain C3 — Momentum Two-Speed", () => {
  it("deve retornar null quando structure não é TREND", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
      }),
    });
    expect(generateC3Intent(input)).toBeNull();
  });

  it("deve retornar null quando liquidity_phase não é CLEAN", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.TREND,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.BUILDUP,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
      }),
    });
    expect(generateC3Intent(input)).toBeNull();
  });

  it("deve retornar null quando execution_state não é OK", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        execution_state: ExecutionHealth.DEGRADED,
        market_states: {
          structure: MarketStructure.TREND,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
      }),
    });
    expect(generateC3Intent(input)).toBeNull();
  });

  it("deve gerar intent válido em TREND + CLEAN + OK com volume suficiente", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.TREND,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 1.5, correlation_index: 0.5 },
      }),
    });
    const result = generateC3Intent(input);
    expect(result).not.toBeNull();
    expect(result!.brain_id).toBe(BrainId.C3);
    const validation = BrainIntentSchema.safeParse(result);
    expect(validation.success).toBe(true);
  });

  it("deve gerar confirmed continuation com volume alto", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.TREND,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 1.5, correlation_index: 0.5 },
      }),
    });
    const result = generateC3Intent(input);
    expect(result).not.toBeNull();
    expect(result!.proposed_risk_pct).toBe(1.0); // confirmed = risco cheio
  });

  it("deve gerar early continuation com volume moderado e risco reduzido", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.TREND,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 1.0, correlation_index: 0.5 },
      }),
    });
    const result = generateC3Intent(input);
    expect(result).not.toBeNull();
    expect(result!.proposed_risk_pct).toBe(0.5); // early = risco reduzido
  });

  it("deve retornar null com volume muito baixo", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.TREND,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 0.5, correlation_index: 0.5 },
      }),
    });
    expect(generateC3Intent(input)).toBeNull();
  });
});

// ─── Brain D2 — News ─────────────────────────────────────────

describe("Brain D2 — News", () => {
  it("deve retornar null quando event_state é NONE", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.NONE,
        },
      }),
    });
    expect(generateD2Intent(input)).toBeNull();
  });

  it("deve gerar intent HEDGE em PRE_EVENT", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.PRE_EVENT,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 1.0, correlation_index: 0.5 },
      }),
    });
    const result = generateD2Intent(input);
    expect(result).not.toBeNull();
    expect(result!.brain_id).toBe(BrainId.D2);
    expect(result!.intent_type).toBe("HEDGE");
    const validation = BrainIntentSchema.safeParse(result);
    expect(validation.success).toBe(true);
  });

  it("deve gerar intent direcional em POST_EVENT com volume", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.POST_EVENT,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 1.5, correlation_index: 0.5 },
      }),
    });
    const result = generateD2Intent(input);
    expect(result).not.toBeNull();
    expect(result!.brain_id).toBe(BrainId.D2);
    expect(["OPEN_LONG", "OPEN_SHORT"]).toContain(result!.intent_type);
  });

  it("deve retornar null em POST_EVENT sem volume", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.POST_EVENT,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 0.5, correlation_index: 0.5 },
      }),
    });
    expect(generateD2Intent(input)).toBeNull();
  });

  it("deve retornar null quando execução está BROKEN", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        execution_state: ExecutionHealth.BROKEN,
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.PRE_EVENT,
        },
      }),
    });
    expect(generateD2Intent(input)).toBeNull();
  });

  it("deve ter severity WARN em PRE_EVENT", () => {
    const input = makeBrainInput({
      mcl: makeMclSnapshot({
        market_states: {
          structure: MarketStructure.RANGE,
          volatility: VolatilityLevel.NORMAL,
          liquidity_phase: LiquidityPhase.CLEAN,
          session: "LONDON" as any,
          event_proximity: EventProximity.PRE_EVENT,
        },
        execution_state: ExecutionHealth.OK,
        metrics: { atr: 0.008, spread_bps: 5, volume_ratio: 1.0, correlation_index: 0.5 },
      }),
    });
    const result = generateD2Intent(input);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("WARN");
  });
});
