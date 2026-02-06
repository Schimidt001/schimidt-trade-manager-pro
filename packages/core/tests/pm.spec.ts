// ═════════════════════════════════════════════════════════════
// PM Tests — Portfolio Manager
// Prova que PM bloqueia violação de exposição e permite hand-off válido.
// ═════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { evaluateIntent } from "../src/pm/portfolioManager";
import { checkExposure } from "../src/pm/exposureGovernor";
import {
  PmDecisionSchema,
  GlobalMode,
  BrainId,
  ReasonCode,
} from "@schimidt-brain/contracts";
import {
  makePmInput,
  makeBrainIntent,
  makePortfolioState,
  makeRiskLimits,
  TEST_EVENT_ID,
  TEST_CORRELATION_ID,
  TEST_TIMESTAMP,
} from "./helpers";

describe("Portfolio Manager — evaluateIntent", () => {
  it("deve retornar PmDecision válida segundo o schema", () => {
    const input = makePmInput();
    const result = evaluateIntent(input);
    const validation = PmDecisionSchema.safeParse(result);
    expect(validation.success).toBe(true);
  });

  it("deve ALLOW intent dentro dos limites em modo NORMAL", () => {
    const input = makePmInput();
    const result = evaluateIntent(input);
    expect(result.decision).toBe("ALLOW");
  });

  it("deve DENY tudo em modo RISK_OFF", () => {
    const input = makePmInput({
      portfolio: makePortfolioState({ global_mode: GlobalMode.RISK_OFF }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("DENY");
    expect(result.why.reason_code).toBe(ReasonCode.PM_POSITION_DENIED);
  });

  it("deve QUEUE quando brain está em cooldown", () => {
    const input = makePmInput({
      portfolio: makePortfolioState({
        cooldowns: [
          {
            scope: "BRAIN",
            target: "A2",
            until: "2025-06-15T12:00:00-03:00", // Futuro relativo ao TEST_TIMESTAMP
          },
        ],
      }),
      intent: makeBrainIntent({ brain_id: BrainId.A2 }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("QUEUE");
    expect(result.why.reason_code).toBe(ReasonCode.PM_POSITION_QUEUED);
  });

  it("deve ALLOW quando cooldown expirou", () => {
    const input = makePmInput({
      portfolio: makePortfolioState({
        cooldowns: [
          {
            scope: "BRAIN",
            target: "A2",
            until: "2025-06-15T09:00:00-03:00", // Passado relativo ao TEST_TIMESTAMP
          },
        ],
      }),
      intent: makeBrainIntent({ brain_id: BrainId.A2 }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("ALLOW");
  });

  it("deve DENY quando max_positions atingido", () => {
    const input = makePmInput({
      portfolio: makePortfolioState({
        risk_state: {
          current_drawdown_pct: -1.0,
          current_exposure_pct: 4.0,
          open_positions: 5,
          daily_loss_pct: -0.5,
          available_risk_pct: 6.0,
        },
        risk_limits: makeRiskLimits({ max_positions: 5 }),
      }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("DENY");
    expect(result.why.reason_code).toBe(ReasonCode.PM_MAX_POSITIONS);
  });

  it("deve DENY quando drawdown limit atingido", () => {
    const input = makePmInput({
      portfolio: makePortfolioState({
        risk_state: {
          current_drawdown_pct: -5.5,
          current_exposure_pct: 2.0,
          open_positions: 1,
          daily_loss_pct: -0.5,
          available_risk_pct: 8.0,
        },
        risk_limits: makeRiskLimits({ max_drawdown_pct: 5 }),
      }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("DENY");
    expect(result.why.reason_code).toBe(ReasonCode.PM_DRAWDOWN_LIMIT);
  });

  it("deve DENY quando daily loss limit atingido", () => {
    const input = makePmInput({
      portfolio: makePortfolioState({
        risk_state: {
          current_drawdown_pct: -1.0,
          current_exposure_pct: 2.0,
          open_positions: 1,
          daily_loss_pct: -3.5,
          available_risk_pct: 8.0,
        },
        risk_limits: makeRiskLimits({ max_daily_loss_pct: 3 }),
      }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("DENY");
    expect(result.why.reason_code).toBe(ReasonCode.PM_DAILY_LOSS_LIMIT);
  });

  it("deve MODIFY quando exposição total excede mas há espaço para risco reduzido", () => {
    const input = makePmInput({
      intent: makeBrainIntent({ proposed_risk_pct: 5.0 }),
      portfolio: makePortfolioState({
        risk_state: {
          current_drawdown_pct: -1.0,
          current_exposure_pct: 8.0,
          open_positions: 2,
          daily_loss_pct: -0.5,
          available_risk_pct: 2.0,
        },
        risk_limits: makeRiskLimits({ max_exposure_pct: 10 }),
      }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("MODIFY");
    expect(result.risk_adjustments).not.toBeNull();
    expect(result.risk_adjustments!.adjusted_risk_pct).toBeLessThan(5.0);
  });

  it("deve MODIFY com risco reduzido em modo EVENT_CLUSTER", () => {
    const input = makePmInput({
      portfolio: makePortfolioState({ global_mode: GlobalMode.EVENT_CLUSTER }),
      intent: makeBrainIntent({ proposed_risk_pct: 1.0 }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("MODIFY");
    expect(result.risk_adjustments).not.toBeNull();
    expect(result.risk_adjustments!.adjusted_risk_pct).toBe(0.5);
  });

  it("deve MODIFY com risco reduzido em modo CORR_BREAK", () => {
    const input = makePmInput({
      portfolio: makePortfolioState({ global_mode: GlobalMode.CORR_BREAK }),
      intent: makeBrainIntent({ proposed_risk_pct: 1.0 }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("MODIFY");
    expect(result.risk_adjustments).not.toBeNull();
    expect(result.risk_adjustments!.adjusted_risk_pct).toBeCloseTo(0.3);
  });

  it("deve ALLOW hand-off CLOSE para posição existente", () => {
    const input = makePmInput({
      intent: makeBrainIntent({
        intent_type: "CLOSE",
        brain_id: BrainId.A2,
        symbol: "EURUSD",
      }),
      portfolio: makePortfolioState({
        positions: [
          {
            symbol: "EURUSD",
            brain_id: BrainId.A2,
            direction: "LONG",
            risk_pct: 1.0,
            entry_price: 1.1000,
            current_price: 1.1050,
            unrealized_pnl_pct: 0.5,
          },
        ],
      }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("ALLOW");
  });

  it("deve DENY hand-off CLOSE quando não existe posição", () => {
    const input = makePmInput({
      intent: makeBrainIntent({
        intent_type: "CLOSE",
        brain_id: BrainId.A2,
        symbol: "GBPUSD",
      }),
      portfolio: makePortfolioState({ positions: [] }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("DENY");
  });

  it("deve ALLOW hand-off SCALE_OUT para posição existente", () => {
    const input = makePmInput({
      intent: makeBrainIntent({
        intent_type: "SCALE_OUT",
        brain_id: BrainId.A2,
        symbol: "EURUSD",
      }),
      portfolio: makePortfolioState({
        positions: [
          {
            symbol: "EURUSD",
            brain_id: BrainId.A2,
            direction: "LONG",
            risk_pct: 1.0,
            entry_price: 1.1000,
            current_price: 1.1050,
            unrealized_pnl_pct: 0.5,
          },
        ],
      }),
    });
    const result = evaluateIntent(input);
    expect(result.decision).toBe("ALLOW");
  });

  it("deve preservar intent_event_id na decisão", () => {
    const intentEventId = "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f";
    const input = makePmInput({
      intent: makeBrainIntent({ event_id: intentEventId }),
    });
    const result = evaluateIntent(input);
    expect(result.intent_event_id).toBe(intentEventId);
  });

  it("deve incluir risk_state na decisão", () => {
    const input = makePmInput();
    const result = evaluateIntent(input);
    expect(result.risk_state).toBeDefined();
    expect(result.risk_state.open_positions).toBeDefined();
    expect(result.risk_state.current_drawdown_pct).toBeDefined();
  });
});

describe("Exposure Governor — checkExposure", () => {
  it("deve permitir quando tudo está dentro dos limites", () => {
    const intent = makeBrainIntent({ proposed_risk_pct: 1.0 });
    const portfolio = makePortfolioState();
    const result = checkExposure(intent, portfolio);
    expect(result.allowed).toBe(true);
  });

  it("deve bloquear por correlação excessiva", () => {
    const intent = makeBrainIntent({ proposed_risk_pct: 2.0, symbol: "EURGBP" });
    const portfolio = makePortfolioState({
      positions: [
        {
          symbol: "EURUSD",
          brain_id: BrainId.A2,
          direction: "LONG",
          risk_pct: 4.0,
          entry_price: 1.1000,
          current_price: 1.1050,
          unrealized_pnl_pct: 0.5,
        },
      ],
      risk_limits: makeRiskLimits({ max_correlated_exposure_pct: 5 }),
    });
    const result = checkExposure(intent, portfolio);
    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe(ReasonCode.PM_CORRELATION_BLOCK);
  });
});
