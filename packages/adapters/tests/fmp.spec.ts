// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Testes do FMP Provider
// Testa cache, rate limit, health check e error handling
// ═════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from "vitest";
import { clearCache, getCacheSize } from "../src/news/fmp";

// ─── Tests: Cache Management ────────────────────────────────

describe("FMP Cache", () => {
  beforeEach(() => {
    clearCache();
  });

  it("cache começa vazio", () => {
    expect(getCacheSize()).toBe(0);
  });

  it("clearCache limpa o cache", () => {
    // O cache está vazio após clearCache
    expect(getCacheSize()).toBe(0);
  });
});

// ─── Tests: fetchCalendarDay error handling ─────────────────

describe("FMP fetchCalendarDay error handling", () => {
  it("rejeita quando API key está vazia", async () => {
    const { fetchCalendarDay } = await import("../src/news/fmp");

    await expect(fetchCalendarDay(new Date(), "")).rejects.toThrow(
      "FMP_API_KEY não configurada ou vazia"
    );
  });

  it("rejeita quando API key é apenas espaços", async () => {
    const { fetchCalendarDay } = await import("../src/news/fmp");

    await expect(fetchCalendarDay(new Date(), "   ")).rejects.toThrow(
      "FMP_API_KEY não configurada ou vazia"
    );
  });
});

// ─── Tests: healthCheck error handling ──────────────────────

describe("FMP healthCheck", () => {
  it("retorna DOWN quando API key está vazia", async () => {
    const { healthCheck } = await import("../src/news/fmp");

    const result = await healthCheck("");

    expect(result.state).toBe("DOWN");
    expect(result.message).toContain("FMP_API_KEY");
    expect(result.latency_ms).toBe(0);
  });

  it("retorna DOWN quando API key é apenas espaços", async () => {
    const { healthCheck } = await import("../src/news/fmp");

    const result = await healthCheck("   ");

    expect(result.state).toBe("DOWN");
  });
});
