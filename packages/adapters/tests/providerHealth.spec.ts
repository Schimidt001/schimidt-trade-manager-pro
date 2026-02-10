// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Testes de Provider Health
// Testa avaliação de saúde do provider de calendário
// ═════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { evaluateProviderHealth, shouldDisableD2 } from "../src/news/providerHealth";
import { normalizeFmpEvent } from "../src/news/normalize";
import type { EconomicEventNormalized, FmpRawEvent } from "../src/news/types";

// ─── Helpers ────────────────────────────────────────────────

function createFmpEvent(overrides: Partial<FmpRawEvent> = {}): FmpRawEvent {
  return {
    date: "2024-03-01 13:30:00",
    country: "US",
    event: "Non-Farm Payrolls",
    currency: "USD",
    previous: 229,
    estimate: 200,
    actual: 275,
    change: 46,
    impact: "High",
    changePercentage: 20.09,
    ...overrides,
  };
}

function createNormalizedEvents(count: number, overrides: Partial<FmpRawEvent> = {}): EconomicEventNormalized[] {
  return Array.from({ length: count }, (_, i) =>
    normalizeFmpEvent(
      createFmpEvent({
        event: `Event ${i}`,
        date: `2024-03-01 ${String(8 + i).padStart(2, "0")}:00:00`,
        ...overrides,
      })
    )
  );
}

// Criar uma segunda-feira para testes de dia útil
const MONDAY = new Date("2024-03-04T12:00:00Z"); // Monday
const SATURDAY = new Date("2024-03-02T12:00:00Z"); // Saturday

// ─── Tests ──────────────────────────────────────────────────

describe("evaluateProviderHealth", () => {
  describe("DOWN scenarios", () => {
    it("retorna DOWN quando fetch falhou com erro", () => {
      const result = evaluateProviderHealth(null, MONDAY, new Error("Network error"));
      expect(result.state).toBe("DOWN");
      expect(result.reason).toContain("Network error");
    });

    it("retorna DOWN quando fetch retornou null", () => {
      const result = evaluateProviderHealth(null, MONDAY);
      expect(result.state).toBe("DOWN");
    });

    it("retorna DOWN quando array vazio em dia útil", () => {
      const result = evaluateProviderHealth([], MONDAY);
      expect(result.state).toBe("DOWN");
      expect(result.reason).toContain("dia útil");
    });

    it("retorna DOWN com reason_code PROV_DISCONNECTED para timeout", () => {
      const result = evaluateProviderHealth(null, MONDAY, new Error("Timeout após 5000ms"));
      expect(result.state).toBe("DOWN");
      expect(result.reason_code).toBe("PROV_DISCONNECTED");
    });
  });

  describe("OK scenarios", () => {
    it("retorna OK com eventos válidos suficientes", () => {
      const events = createNormalizedEvents(10);
      const result = evaluateProviderHealth(events, MONDAY);
      expect(result.state).toBe("OK");
    });

    it("retorna OK com zero eventos no fim de semana", () => {
      const result = evaluateProviderHealth([], SATURDAY);
      expect(result.state).toBe("OK");
    });
  });

  describe("DEGRADED scenarios", () => {
    it("retorna DEGRADED quando volume é absurdamente alto", () => {
      const events = createNormalizedEvents(501);
      const result = evaluateProviderHealth(events, MONDAY);
      expect(result.state).toBe("DEGRADED");
      expect(result.reason).toContain("volume anormal");
    });

    it("retorna DEGRADED quando poucos eventos em dia útil", () => {
      const events = createNormalizedEvents(2);
      const result = evaluateProviderHealth(events, MONDAY);
      expect(result.state).toBe("DEGRADED");
      expect(result.reason).toContain("dia útil");
    });
  });
});

describe("shouldDisableD2", () => {
  it("retorna false quando provider OK", () => {
    expect(shouldDisableD2("OK")).toBe(false);
  });

  it("retorna true quando provider DEGRADED", () => {
    expect(shouldDisableD2("DEGRADED")).toBe(true);
  });

  it("retorna true quando provider DOWN", () => {
    expect(shouldDisableD2("DOWN")).toBe(true);
  });
});
