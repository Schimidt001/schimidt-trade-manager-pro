// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Trading Economics Provider Tests
// ═════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchCalendarDay, healthCheck, clearCache } from "../src/news/tradingEconomics";

// ─── Mocks ──────────────────────────────────────────────────

const mockTradingEconomicsResponse = [
  {
    CalendarId: "314991",
    Date: "2023-01-03T00:00:00",
    Country: "United States",
    Category: "Non Farm Payrolls",
    Event: "Non Farm Payrolls",
    Reference: "Dec",
    ReferenceDate: "2022-12-31T00:00:00",
    Source: "U.S. Bureau of Labor Statistics",
    SourceURL: "https://www.bls.gov/",
    Actual: "223K",
    Previous: "256K",
    Forecast: "200K",
    TEForecast: "210K",
    URL: "/united-states/non-farm-payrolls",
    DateSpan: 0,
    Importance: 3,
    LastUpdate: "2023-01-03T08:30:00",
    Revised: "",
    Currency: "",
    Unit: "K",
    Ticker: "NFP",
    Symbol: "NFP",
  },
  {
    CalendarId: "314992",
    Date: "2023-01-03T10:00:00",
    Country: "United Kingdom",
    Category: "GDP Growth Rate",
    Event: "GDP Growth Rate QoQ",
    Reference: "Q4",
    ReferenceDate: "2022-12-31T00:00:00",
    Source: "Office for National Statistics",
    SourceURL: "https://www.ons.gov.uk/",
    Actual: "0.3%",
    Previous: "0.2%",
    Forecast: "0.2%",
    TEForecast: "0.3%",
    URL: "/united-kingdom/gdp-growth",
    DateSpan: 0,
    Importance: 2,
    LastUpdate: "2023-01-03T10:00:00",
    Revised: "",
    Currency: "",
    Unit: "%",
    Ticker: "UKGDPQOQ",
    Symbol: "UKGDPQOQ",
  },
];

// ─── Tests ──────────────────────────────────────────────────

describe("Trading Economics Provider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearCache();
  });

  describe("fetchCalendarDay", () => {
    it("deve buscar eventos com guest:guest e normalizar corretamente", async () => {
      // Mock do fetch global
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockTradingEconomicsResponse,
      } as Response);

      const testDate = new Date("2023-01-03");
      const events = await fetchCalendarDay(testDate, "guest:guest");

      expect(events).toHaveLength(2);

      // Verificar primeiro evento (NFP - HIGH impact)
      const nfp = events[0];
      expect(nfp.country).toBe("United States");
      expect(nfp.currency).toBe("USD");
      expect(nfp.title).toBe("Non Farm Payrolls");
      expect(nfp.impact).toBe("HIGH");
      expect(nfp.impact_source).toBe("PROVIDER");
      expect(nfp.previous).toBe(256);
      expect(nfp.forecast).toBe(200);
      expect(nfp.actual).toBe(223);
      expect(nfp.source).toBe("TE");
      expect(nfp.id).toBeDefined();

      // Verificar segundo evento (GDP - MEDIUM impact)
      const gdp = events[1];
      expect(gdp.country).toBe("United Kingdom");
      expect(gdp.currency).toBe("GBP");
      expect(gdp.title).toBe("GDP Growth Rate QoQ");
      expect(gdp.impact).toBe("MEDIUM");
      expect(gdp.impact_source).toBe("PROVIDER");
      expect(gdp.previous).toBe(0.2);
      expect(gdp.forecast).toBe(0.2);
      expect(gdp.actual).toBe(0.3);
      expect(gdp.source).toBe("TE");
    });

    it("deve usar API key fornecida se não vazia", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);

      const testDate = new Date("2023-01-03");
      const customApiKey = "my-custom-key";

      await fetchCalendarDay(testDate, customApiKey);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`c=${encodeURIComponent(customApiKey)}`),
        expect.any(Object),
      );
    });

    it("deve usar guest:guest como fallback se API key vazia", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);

      const testDate = new Date("2023-01-03");

      await fetchCalendarDay(testDate, "");

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("c=guest%3Aguest"),
        expect.any(Object),
      );
    });

    it("deve cachear resultados por 15 minutos", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockTradingEconomicsResponse,
      } as Response);

      const testDate = new Date("2023-01-03");

      // Primeira chamada
      await fetchCalendarDay(testDate, "guest:guest");
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Segunda chamada (deve usar cache)
      await fetchCalendarDay(testDate, "guest:guest");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("deve fazer retry em caso de timeout", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Primeira tentativa: timeout
          return Promise.reject(new DOMException("AbortError", "AbortError"));
        }
        // Segunda tentativa: sucesso
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [],
        } as Response);
      });

      const testDate = new Date("2023-01-03");
      const events = await fetchCalendarDay(testDate, "guest:guest");

      expect(callCount).toBe(2);
      expect(events).toHaveLength(0);
    });

    it("deve lançar erro se HTTP 401/403", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      } as Response);

      const testDate = new Date("2023-01-03");

      await expect(fetchCalendarDay(testDate, "invalid-key")).rejects.toThrow(
        /Autenticação falhou/,
      );
    });

    it("deve lançar erro se resposta não for array", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ error: "Invalid response" }),
      } as Response);

      const testDate = new Date("2023-01-03");

      await expect(fetchCalendarDay(testDate, "guest:guest")).rejects.toThrow(
        /Resposta inesperada/,
      );
    });

    it("deve filtrar eventos sem campos essenciais", async () => {
      const invalidEvents = [
        ...mockTradingEconomicsResponse,
        {
          CalendarId: "999",
          Date: "",
          Country: "Test",
          Category: "Test",
          Event: "",
          Importance: null,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidEvents,
      } as Response);

      const testDate = new Date("2023-01-03");
      const events = await fetchCalendarDay(testDate, "guest:guest");

      // Deve filtrar o evento inválido
      expect(events).toHaveLength(2);
    });
  });

  describe("healthCheck", () => {
    it("deve retornar healthy=true se API responder OK", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);

      const health = await healthCheck("guest:guest");

      expect(health.healthy).toBe(true);
      expect(health.reason).toBe("OK");
      expect(health.message).toContain("Provider OK");
    });

    it("deve retornar healthy=false se HTTP 401/403", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as Response);

      const health = await healthCheck("invalid-key");

      expect(health.healthy).toBe(false);
      expect(health.reason).toBe("AUTH_FAILED");
      expect(health.message).toContain("Autenticação falhou");
    });

    it("deve retornar healthy=false se resposta não for array", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ error: "Invalid" }),
      } as Response);

      const health = await healthCheck("guest:guest");

      expect(health.healthy).toBe(false);
      expect(health.reason).toBe("INVALID_RESPONSE");
      expect(health.message).toContain("não é um array");
    });

    it("deve retornar healthy=false em caso de erro de rede", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const health = await healthCheck("guest:guest");

      expect(health.healthy).toBe(false);
      expect(health.reason).toBe("NETWORK_ERROR");
      expect(health.message).toContain("Network error");
    });
  });
});
