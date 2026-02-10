// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Testes do Calendar Service
// Testa computeEventWindows e getNextHighImpactEvent
// ═════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  computeEventWindows,
  getNextHighImpactEvent,
} from "../src/news/calendarService";
import { normalizeFmpEvent } from "../src/news/normalize";
import type { FmpRawEvent, EconomicEventNormalized } from "../src/news/types";

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

// ─── Tests: computeEventWindows ─────────────────────────────

describe("computeEventWindows", () => {
  it("gera 2 janelas para cada evento HIGH impact", () => {
    const events = [
      normalizeFmpEvent(createFmpEvent({ impact: "High" })),
    ];

    const windows = computeEventWindows(events);

    expect(windows).toHaveLength(2);
    expect(windows[0].policy).toBe("NO_TRADE_SENSITIVE");
    expect(windows[1].policy).toBe("CONDITIONAL_ONLY");
  });

  it("não gera janelas para eventos MEDIUM ou LOW", () => {
    const events = [
      normalizeFmpEvent(createFmpEvent({ impact: "Medium" })),
      normalizeFmpEvent(createFmpEvent({ impact: "Low", event: "Other" })),
    ];

    const windows = computeEventWindows(events);

    expect(windows).toHaveLength(0);
  });

  it("janela NO_TRADE_SENSITIVE é T-30 a T+20", () => {
    const events = [
      normalizeFmpEvent(createFmpEvent({ impact: "High" })),
    ];

    const windows = computeEventWindows(events);
    const noTrade = windows.find((w) => w.policy === "NO_TRADE_SENSITIVE")!;

    const eventTime = new Date(events[0].timestamp).getTime();
    const startTime = new Date(noTrade.start).getTime();
    const endTime = new Date(noTrade.end).getTime();

    // T-30 minutos
    expect(startTime).toBe(eventTime - 30 * 60 * 1000);
    // T+20 minutos
    expect(endTime).toBe(eventTime + 20 * 60 * 1000);
  });

  it("janela CONDITIONAL_ONLY é T+20 a T+60", () => {
    const events = [
      normalizeFmpEvent(createFmpEvent({ impact: "High" })),
    ];

    const windows = computeEventWindows(events);
    const conditional = windows.find((w) => w.policy === "CONDITIONAL_ONLY")!;

    const eventTime = new Date(events[0].timestamp).getTime();
    const startTime = new Date(conditional.start).getTime();
    const endTime = new Date(conditional.end).getTime();

    // T+20 minutos
    expect(startTime).toBe(eventTime + 20 * 60 * 1000);
    // T+60 minutos
    expect(endTime).toBe(eventTime + 60 * 60 * 1000);
  });

  it("propaga currency do evento para a janela", () => {
    const events = [
      normalizeFmpEvent(createFmpEvent({ currency: "EUR", impact: "High" })),
    ];

    const windows = computeEventWindows(events);

    expect(windows[0].currency).toBe("EUR");
    expect(windows[1].currency).toBe("EUR");
  });

  it("gera janelas para múltiplos eventos HIGH", () => {
    const events = [
      normalizeFmpEvent(createFmpEvent({ impact: "High", event: "NFP", date: "2024-03-01 13:30:00" })),
      normalizeFmpEvent(createFmpEvent({ impact: "High", event: "CPI", date: "2024-03-01 15:00:00", country: "GB", currency: "GBP" })),
    ];

    const windows = computeEventWindows(events);

    expect(windows).toHaveLength(4); // 2 janelas por evento HIGH
  });

  it("ordena janelas por horário de início", () => {
    const events = [
      normalizeFmpEvent(createFmpEvent({ impact: "High", event: "Late", date: "2024-03-01 18:00:00" })),
      normalizeFmpEvent(createFmpEvent({ impact: "High", event: "Early", date: "2024-03-01 10:00:00" })),
    ];

    const windows = computeEventWindows(events);

    for (let i = 1; i < windows.length; i++) {
      expect(new Date(windows[i].start).getTime())
        .toBeGreaterThanOrEqual(new Date(windows[i - 1].start).getTime());
    }
  });

  it("retorna array vazio quando não há eventos", () => {
    const windows = computeEventWindows([]);
    expect(windows).toHaveLength(0);
  });
});

// ─── Tests: getNextHighImpactEvent ──────────────────────────

describe("getNextHighImpactEvent", () => {
  it("retorna o próximo evento HIGH impact futuro", () => {
    const events = [
      normalizeFmpEvent(createFmpEvent({
        impact: "High",
        event: "Past NFP",
        date: "2024-03-01 10:00:00",
      })),
      normalizeFmpEvent(createFmpEvent({
        impact: "High",
        event: "Future CPI",
        date: "2024-03-01 18:00:00",
      })),
    ];

    const now = "2024-03-01T12:00:00-03:00";
    const result = getNextHighImpactEvent(events, now);

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Future CPI");
  });

  it("ignora eventos MEDIUM e LOW", () => {
    const events = [
      normalizeFmpEvent(createFmpEvent({
        impact: "Medium",
        event: "Medium Event",
        date: "2024-03-01 18:00:00",
      })),
      normalizeFmpEvent(createFmpEvent({
        impact: "Low",
        event: "Low Event",
        date: "2024-03-01 19:00:00",
      })),
    ];

    const now = "2024-03-01T12:00:00-03:00";
    const result = getNextHighImpactEvent(events, now);

    expect(result).toBeNull();
  });

  it("retorna null quando não há eventos futuros HIGH", () => {
    const events = [
      normalizeFmpEvent(createFmpEvent({
        impact: "High",
        event: "Past NFP",
        date: "2024-03-01 10:00:00",
      })),
    ];

    const now = "2024-03-01T20:00:00-03:00";
    const result = getNextHighImpactEvent(events, now);

    expect(result).toBeNull();
  });

  it("retorna null para array vazio", () => {
    const result = getNextHighImpactEvent([], "2024-03-01T12:00:00-03:00");
    expect(result).toBeNull();
  });

  it("retorna o mais próximo quando há múltiplos HIGH futuros", () => {
    const events = [
      normalizeFmpEvent(createFmpEvent({
        impact: "High",
        event: "Later Event",
        date: "2024-03-01 20:00:00",
      })),
      normalizeFmpEvent(createFmpEvent({
        impact: "High",
        event: "Sooner Event",
        date: "2024-03-01 16:00:00",
      })),
    ];

    const now = "2024-03-01T12:00:00-03:00";
    const result = getNextHighImpactEvent(events, now);

    expect(result).not.toBeNull();
    expect(result!.title).toBe("Sooner Event");
  });
});
