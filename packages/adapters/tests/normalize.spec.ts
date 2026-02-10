// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Testes de Normalização
// Testa normalização de eventos FMP, TE e Finnhub
// ═════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import {
  normalizeFmpEvent,
  normalizeTradingEconomicsEvent,
  normalizeFinnhubEvent,
  generateDeterministicId,
  generateLegacyDeterministicId,
  toUtcMinus3,
  mapFmpImpact,
  mapTeImportance,
  mapFinnhubImpact,
  parseNumericValue,
  sortEventsByTimestamp,
} from "../src/news/normalize";
import type {
  FmpRawEvent,
  TradingEconomicsRawEvent,
  FinnhubRawEvent,
} from "../src/news/types";

// ─── Fixtures ───────────────────────────────────────────────

const FMP_HIGH_EVENT: FmpRawEvent = {
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
};

const FMP_LOW_EVENT: FmpRawEvent = {
  date: "2024-03-01 03:35:00",
  country: "JP",
  event: "3-Month Bill Auction",
  currency: "JPY",
  previous: -0.112,
  estimate: null,
  actual: -0.096,
  change: 0.016,
  impact: "Low",
  changePercentage: 14.286,
};

const FMP_NO_IMPACT_EVENT: FmpRawEvent = {
  date: "2024-03-01 10:00:00",
  country: "DE",
  event: "Manufacturing PMI",
  currency: "EUR",
  previous: 42.5,
  estimate: 43.0,
  actual: null,
  change: null,
  impact: "",
  changePercentage: null,
};

const TE_EVENT: TradingEconomicsRawEvent = {
  CalendarId: 12345,
  Date: "2024-03-01T13:30:00",
  Country: "United States",
  Category: "Employment",
  Event: "Non-Farm Payrolls",
  Importance: 3,
  Actual: "275K",
  Previous: "229K",
  Forecast: "200K",
  Currency: "USD",
};

const FINNHUB_EVENT: FinnhubRawEvent = {
  actual: 275,
  country: "US",
  estimate: 200,
  event: "Non-Farm Payrolls",
  impact: "high",
  prev: 229,
  time: "2024-03-01 13:30:00",
  unit: "%",
};

// ─── Tests: FMP Normalization ───────────────────────────────

describe("normalizeFmpEvent", () => {
  it("normaliza evento HIGH impact do FMP corretamente", () => {
    const result = normalizeFmpEvent(FMP_HIGH_EVENT);

    expect(result.source).toBe("FMP");
    expect(result.country).toBe("US");
    expect(result.currency).toBe("USD");
    expect(result.title).toBe("Non-Farm Payrolls");
    expect(result.impact).toBe("HIGH");
    expect(result.impact_source).toBe("PROVIDER");
    expect(result.previous).toBe(229);
    expect(result.forecast).toBe(200);
    expect(result.actual).toBe(275);
    expect(result.id).toBeTruthy();
    expect(result.timestamp).toContain("-03:00");
  });

  it("normaliza evento LOW impact do FMP corretamente", () => {
    const result = normalizeFmpEvent(FMP_LOW_EVENT);

    expect(result.source).toBe("FMP");
    expect(result.country).toBe("JP");
    expect(result.currency).toBe("JPY");
    expect(result.impact).toBe("LOW");
    expect(result.impact_source).toBe("PROVIDER");
    expect(result.forecast).toBeNull();
  });

  it("infere MEDIUM quando impact está vazio", () => {
    const result = normalizeFmpEvent(FMP_NO_IMPACT_EVENT);

    expect(result.impact).toBe("MEDIUM");
    expect(result.impact_source).toBe("INFERRED");
    expect(result.country).toBe("DE");
    expect(result.currency).toBe("EUR");
    expect(result.actual).toBeNull();
  });

  it("gera ID determinístico consistente", () => {
    const result1 = normalizeFmpEvent(FMP_HIGH_EVENT);
    const result2 = normalizeFmpEvent(FMP_HIGH_EVENT);

    expect(result1.id).toBe(result2.id);
    expect(result1.id).toHaveLength(40); // SHA-1 hex
  });

  it("gera IDs diferentes para eventos diferentes", () => {
    const result1 = normalizeFmpEvent(FMP_HIGH_EVENT);
    const result2 = normalizeFmpEvent(FMP_LOW_EVENT);

    expect(result1.id).not.toBe(result2.id);
  });

  it("preserva dados brutos no campo raw", () => {
    const result = normalizeFmpEvent(FMP_HIGH_EVENT);

    expect(result.raw).toEqual(FMP_HIGH_EVENT);
  });

  it("trata evento sem currency usando fallback por país", () => {
    const eventNoCurrency: FmpRawEvent = {
      ...FMP_HIGH_EVENT,
      currency: "",
    };
    const result = normalizeFmpEvent(eventNoCurrency);

    expect(result.currency).toBe("USD"); // Fallback US → USD
  });
});

// ─── Tests: TE Normalization (legacy) ───────────────────────

describe("normalizeTradingEconomicsEvent", () => {
  it("normaliza evento TE corretamente", () => {
    const result = normalizeTradingEconomicsEvent(TE_EVENT);

    expect(result.source).toBe("TE");
    expect(result.country).toBe("United States");
    expect(result.currency).toBe("USD");
    expect(result.title).toBe("Non-Farm Payrolls");
    expect(result.impact).toBe("HIGH");
    expect(result.impact_source).toBe("PROVIDER");
    expect(result.timestamp).toContain("-03:00");
  });
});

// ─── Tests: Finnhub Normalization (legacy) ──────────────────

describe("normalizeFinnhubEvent", () => {
  it("normaliza evento Finnhub corretamente", () => {
    const result = normalizeFinnhubEvent(FINNHUB_EVENT);

    expect(result.source).toBe("FINNHUB");
    expect(result.country).toBe("US");
    expect(result.currency).toBe("USD");
    expect(result.title).toBe("Non-Farm Payrolls");
    expect(result.impact).toBe("HIGH");
    expect(result.previous).toBe(229);
    expect(result.forecast).toBe(200);
    expect(result.actual).toBe(275);
  });
});

// ─── Tests: Helper Functions ────────────────────────────────

describe("generateDeterministicId", () => {
  it("gera hash SHA-1 de 40 caracteres", () => {
    const id = generateDeterministicId("FMP", "US", "2024-03-01T10:30:00-03:00", "NFP");
    expect(id).toHaveLength(40);
    expect(/^[0-9a-f]{40}$/.test(id)).toBe(true);
  });

  it("é determinístico — mesma entrada = mesmo ID", () => {
    const id1 = generateDeterministicId("FMP", "US", "2024-03-01T10:30:00-03:00", "NFP");
    const id2 = generateDeterministicId("FMP", "US", "2024-03-01T10:30:00-03:00", "NFP");
    expect(id1).toBe(id2);
  });

  it("entradas diferentes geram IDs diferentes", () => {
    const id1 = generateDeterministicId("FMP", "US", "2024-03-01T10:30:00-03:00", "NFP");
    const id2 = generateDeterministicId("FMP", "JP", "2024-03-01T10:30:00-03:00", "CPI");
    expect(id1).not.toBe(id2);
  });
});

describe("generateLegacyDeterministicId", () => {
  it("gera hash SHA-1 de 40 caracteres (legacy)", () => {
    const id = generateLegacyDeterministicId("USD", "2024-03-01T10:30:00-03:00", "NFP");
    expect(id).toHaveLength(40);
  });
});

describe("toUtcMinus3", () => {
  it("converte UTC para UTC-3", () => {
    const result = toUtcMinus3("2024-03-01T13:30:00Z");
    expect(result).toContain("-03:00");
    expect(result).toContain("10:30:00");
  });

  it("retorna string original se data inválida", () => {
    const result = toUtcMinus3("invalid-date");
    expect(result).toBe("invalid-date");
  });
});

describe("mapFmpImpact", () => {
  it("mapeia 'High' para HIGH/PROVIDER", () => {
    const result = mapFmpImpact("High");
    expect(result.level).toBe("HIGH");
    expect(result.source).toBe("PROVIDER");
  });

  it("mapeia 'Medium' para MEDIUM/PROVIDER", () => {
    const result = mapFmpImpact("Medium");
    expect(result.level).toBe("MEDIUM");
    expect(result.source).toBe("PROVIDER");
  });

  it("mapeia 'Low' para LOW/PROVIDER", () => {
    const result = mapFmpImpact("Low");
    expect(result.level).toBe("LOW");
    expect(result.source).toBe("PROVIDER");
  });

  it("mapeia string vazia para MEDIUM/INFERRED", () => {
    const result = mapFmpImpact("");
    expect(result.level).toBe("MEDIUM");
    expect(result.source).toBe("INFERRED");
  });

  it("mapeia null para MEDIUM/INFERRED", () => {
    const result = mapFmpImpact(null);
    expect(result.level).toBe("MEDIUM");
    expect(result.source).toBe("INFERRED");
  });

  it("mapeia undefined para MEDIUM/INFERRED", () => {
    const result = mapFmpImpact(undefined);
    expect(result.level).toBe("MEDIUM");
    expect(result.source).toBe("INFERRED");
  });

  it("mapeia string desconhecida para MEDIUM/INFERRED", () => {
    const result = mapFmpImpact("Unknown");
    expect(result.level).toBe("MEDIUM");
    expect(result.source).toBe("INFERRED");
  });
});

describe("mapTeImportance", () => {
  it("mapeia 3 para HIGH", () => expect(mapTeImportance(3)).toBe("HIGH"));
  it("mapeia 2 para MEDIUM", () => expect(mapTeImportance(2)).toBe("MEDIUM"));
  it("mapeia 1 para LOW", () => expect(mapTeImportance(1)).toBe("LOW"));
  it("mapeia 0 para LOW", () => expect(mapTeImportance(0)).toBe("LOW"));
});

describe("mapFinnhubImpact", () => {
  it("mapeia 'high' para HIGH", () => expect(mapFinnhubImpact("high")).toBe("HIGH"));
  it("mapeia 'medium' para MEDIUM", () => expect(mapFinnhubImpact("medium")).toBe("MEDIUM"));
  it("mapeia 'low' para LOW", () => expect(mapFinnhubImpact("low")).toBe("LOW"));
  it("mapeia string vazia para LOW", () => expect(mapFinnhubImpact("")).toBe("LOW"));
});

describe("parseNumericValue", () => {
  it("retorna número diretamente", () => expect(parseNumericValue(42)).toBe(42));
  it("retorna null para null", () => expect(parseNumericValue(null)).toBeNull());
  it("retorna null para undefined", () => expect(parseNumericValue(undefined)).toBeNull());
  it("parseia string numérica", () => expect(parseNumericValue("42.5")).toBe(42.5));
  it("parseia string com % e K", () => expect(parseNumericValue("275K")).toBe(275));
  it("parseia string negativa", () => expect(parseNumericValue("-0.5")).toBe(-0.5));
  it("retorna null para string vazia", () => expect(parseNumericValue("")).toBeNull());
  it("retorna null para NaN", () => expect(parseNumericValue(NaN)).toBeNull());
});

describe("sortEventsByTimestamp", () => {
  it("ordena eventos por timestamp ascendente", () => {
    const events = [
      normalizeFmpEvent({ ...FMP_HIGH_EVENT, date: "2024-03-01 15:00:00" }),
      normalizeFmpEvent({ ...FMP_HIGH_EVENT, date: "2024-03-01 10:00:00" }),
      normalizeFmpEvent({ ...FMP_HIGH_EVENT, date: "2024-03-01 12:00:00" }),
    ];

    const sorted = sortEventsByTimestamp(events);

    expect(new Date(sorted[0].timestamp).getTime())
      .toBeLessThan(new Date(sorted[1].timestamp).getTime());
    expect(new Date(sorted[1].timestamp).getTime())
      .toBeLessThan(new Date(sorted[2].timestamp).getTime());
  });

  it("não modifica o array original", () => {
    const events = [
      normalizeFmpEvent({ ...FMP_HIGH_EVENT, date: "2024-03-01 15:00:00" }),
      normalizeFmpEvent({ ...FMP_HIGH_EVENT, date: "2024-03-01 10:00:00" }),
    ];
    const original = [...events];

    sortEventsByTimestamp(events);

    expect(events[0].timestamp).toBe(original[0].timestamp);
  });
});
