// ═════════════════════════════════════════════════════════════
// EHM Tests — Edge Health Monitor
// Prova que EHM encerra edge morto corretamente.
// ═════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { evaluateEdgeHealth } from "../src/ehm/edgeHealthMonitor";
import {
  EhmActionSchema,
  ExecutionHealth,
  VolatilityLevel,
  BrainId,
} from "@schimidt-brain/contracts";
import {
  makeEhmInput,
  makeActivePosition,
  makePositionResult,
  makeMclSnapshot,
} from "./helpers";

describe("Edge Health Monitor — evaluateEdgeHealth", () => {
  it("deve retornar null para posição saudável", () => {
    const input = makeEhmInput();
    const result = evaluateEdgeHealth(input);
    expect(result).toBeNull();
  });

  it("deve retornar EhmAction válida segundo o schema quando ação é necessária", () => {
    const input = makeEhmInput({
      position: makeActivePosition({ unrealized_pnl_pct: -4.0 }),
    });
    const result = evaluateEdgeHealth(input);
    expect(result).not.toBeNull();
    const validation = EhmActionSchema.safeParse(result);
    expect(validation.success).toBe(true);
  });

  it("deve retornar EXIT_NOW para perda não realizada crítica", () => {
    const input = makeEhmInput({
      position: makeActivePosition({ unrealized_pnl_pct: -4.0 }),
    });
    const result = evaluateEdgeHealth(input);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("EXIT_NOW");
    expect(result!.severity).toBe("ERROR");
  });

  it("deve retornar REDUCE_RISK para perda não realizada moderada", () => {
    const input = makeEhmInput({
      position: makeActivePosition({ unrealized_pnl_pct: -2.0 }),
    });
    const result = evaluateEdgeHealth(input);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("REDUCE_RISK");
  });

  it("deve retornar EXIT_NOW para edge morto (longa duração sem progresso)", () => {
    const input = makeEhmInput({
      position: makeActivePosition({
        unrealized_pnl_pct: -0.3,
        duration_minutes: 300,
        max_favorable_pct: 0.1,
        max_adverse_pct: 1.0,
      }),
    });
    const result = evaluateEdgeHealth(input);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("EXIT_NOW");
  });

  it("deve retornar EXIT_NOW para edge morto (adverse >> favorable)", () => {
    const input = makeEhmInput({
      position: makeActivePosition({
        unrealized_pnl_pct: -0.5,
        duration_minutes: 60,
        max_favorable_pct: 0.2,
        max_adverse_pct: 1.0,
      }),
    });
    const result = evaluateEdgeHealth(input);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("EXIT_NOW");
  });

  it("deve retornar COOLDOWN após loss streak", () => {
    const losses = [
      makePositionResult({ brain_id: BrainId.A2, pnl_pct: -0.5 }),
      makePositionResult({ brain_id: BrainId.A2, pnl_pct: -0.3 }),
      makePositionResult({ brain_id: BrainId.A2, pnl_pct: -0.8 }),
    ];
    const input = makeEhmInput({
      position: makeActivePosition({
        brain_id: BrainId.A2,
        unrealized_pnl_pct: -0.1,
      }),
      recent_results: losses,
    });
    const result = evaluateEdgeHealth(input);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("COOLDOWN");
    expect(result!.cooldown).not.toBeNull();
    expect(result!.cooldown!.scope).toBe("BRAIN");
    expect(result!.cooldown!.target).toBe("A2");
  });

  it("não deve ativar COOLDOWN se perdas são de brains diferentes", () => {
    const losses = [
      makePositionResult({ brain_id: BrainId.A2, pnl_pct: -0.5 }),
      makePositionResult({ brain_id: BrainId.B3, pnl_pct: -0.3 }),
      makePositionResult({ brain_id: BrainId.A2, pnl_pct: -0.8 }),
    ];
    const input = makeEhmInput({
      position: makeActivePosition({
        brain_id: BrainId.A2,
        unrealized_pnl_pct: 0.1,
      }),
      recent_results: losses,
    });
    const result = evaluateEdgeHealth(input);
    // Não deve ser COOLDOWN porque a streak do A2 é interrompida pelo B3
    // (B3 é ignorado, mas a sequência de A2 é: -0.5, -0.8 = 2, não 3)
    expect(result === null || result.action !== "COOLDOWN").toBe(true);
  });

  it("deve retornar REDUCE_RISK quando execução está DEGRADED", () => {
    const input = makeEhmInput({
      position: makeActivePosition({ unrealized_pnl_pct: 0.1 }),
      mcl: makeMclSnapshot({ execution_state: ExecutionHealth.DEGRADED }),
    });
    const result = evaluateEdgeHealth(input);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("REDUCE_RISK");
  });

  it("deve retornar EXIT_NOW quando execução está BROKEN", () => {
    const input = makeEhmInput({
      position: makeActivePosition({ unrealized_pnl_pct: 0.1 }),
      mcl: makeMclSnapshot({ execution_state: ExecutionHealth.BROKEN }),
    });
    const result = evaluateEdgeHealth(input);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("EXIT_NOW");
    expect(result!.severity).toBe("ERROR");
  });

  it("deve retornar REDUCE_RISK para volatilidade alta com posição negativa", () => {
    const input = makeEhmInput({
      position: makeActivePosition({ unrealized_pnl_pct: -0.3 }),
      mcl: makeMclSnapshot({
        market_states: {
          structure: "RANGE" as any,
          volatility: VolatilityLevel.HIGH,
          liquidity_phase: "CLEAN" as any,
          session: "LONDON" as any,
          event_proximity: "NONE" as any,
        },
      }),
    });
    const result = evaluateEdgeHealth(input);
    expect(result).not.toBeNull();
    expect(result!.action).toBe("REDUCE_RISK");
  });

  it("deve retornar null para volatilidade alta com posição positiva", () => {
    const input = makeEhmInput({
      position: makeActivePosition({ unrealized_pnl_pct: 0.5 }),
      mcl: makeMclSnapshot({
        market_states: {
          structure: "RANGE" as any,
          volatility: VolatilityLevel.HIGH,
          liquidity_phase: "CLEAN" as any,
          session: "LONDON" as any,
          event_proximity: "NONE" as any,
        },
      }),
    });
    const result = evaluateEdgeHealth(input);
    expect(result).toBeNull();
  });

  it("deve incluir affected_brains e affected_symbols corretos", () => {
    const input = makeEhmInput({
      position: makeActivePosition({
        brain_id: BrainId.C3,
        symbol: "GBPUSD",
        unrealized_pnl_pct: -4.0,
      }),
    });
    const result = evaluateEdgeHealth(input);
    expect(result).not.toBeNull();
    expect(result!.affected_brains).toContain("C3");
    expect(result!.affected_symbols).toContain("GBPUSD");
  });

  it("nunca deve criar entrada (sempre retorna ação de proteção ou null)", () => {
    // Testar com vários cenários que a ação nunca é de abertura
    const scenarios = [
      makeEhmInput({ position: makeActivePosition({ unrealized_pnl_pct: -4.0 }) }),
      makeEhmInput({ position: makeActivePosition({ unrealized_pnl_pct: -2.0 }) }),
      makeEhmInput({
        position: makeActivePosition({ unrealized_pnl_pct: -0.1 }),
        recent_results: [
          makePositionResult({ pnl_pct: -0.5 }),
          makePositionResult({ pnl_pct: -0.3 }),
          makePositionResult({ pnl_pct: -0.8 }),
        ],
      }),
    ];

    for (const input of scenarios) {
      const result = evaluateEdgeHealth(input);
      if (result !== null) {
        expect(["REDUCE_RISK", "EXIT_NOW", "COOLDOWN"]).toContain(result.action);
      }
    }
  });
});
