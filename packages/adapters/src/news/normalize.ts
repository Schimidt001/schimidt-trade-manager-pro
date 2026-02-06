// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Normalização de Eventos
// Converte dados brutos de TE e Finnhub para formato interno
// ═════════════════════════════════════════════════════════════

import { createHash } from "crypto";
import type {
  EconomicEventNormalized,
  ImpactLevel,
  TradingEconomicsRawEvent,
  FinnhubRawEvent,
} from "./types";

// ─── Constantes ─────────────────────────────────────────────

/** Offset UTC-3 em milissegundos (Brasília) */
const UTC_MINUS_3_OFFSET_MS = -3 * 60 * 60 * 1000;

/**
 * Mapeamento de códigos de país ISO 2-letter (Finnhub) para moeda.
 * Usado quando a moeda não vem diretamente na resposta do Finnhub.
 */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD",
  AU: "AUD",
  CA: "CAD",
  GB: "GBP",
  EU: "EUR",
  JP: "JPY",
  NZ: "NZD",
  CH: "CHF",
  CN: "CNY",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  BR: "BRL",
  MX: "MXN",
  KR: "KRW",
  IN: "INR",
  ZA: "ZAR",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  TR: "TRY",
  RU: "RUB",
  SG: "SGD",
  HK: "HKD",
  TW: "TWD",
  TH: "THB",
  ID: "IDR",
  MY: "MYR",
  PH: "PHP",
  CL: "CLP",
  CO: "COP",
  PE: "PEN",
  AR: "ARS",
  IL: "ILS",
  CZ: "CZK",
  HU: "HUF",
  RO: "RON",
  AT: "EUR",
  BE: "EUR",
  FI: "EUR",
  GR: "EUR",
  IE: "EUR",
  NL: "EUR",
  PT: "EUR",
};

/**
 * Mapeamento de nomes de país (Trading Economics) para moeda.
 * Usado quando Currency não vem na resposta do TE.
 */
const COUNTRY_NAME_TO_CURRENCY: Record<string, string> = {
  "United States": "USD",
  "United Kingdom": "GBP",
  Canada: "CAD",
  Australia: "AUD",
  Japan: "JPY",
  "New Zealand": "NZD",
  Switzerland: "CHF",
  China: "CNY",
  Germany: "EUR",
  France: "EUR",
  Italy: "EUR",
  Spain: "EUR",
  "Euro Area": "EUR",
  Brazil: "BRL",
  Mexico: "MXN",
  "South Korea": "KRW",
  India: "INR",
  "South Africa": "ZAR",
  Sweden: "SEK",
  Norway: "NOK",
  Denmark: "DKK",
  Poland: "PLN",
  Turkey: "TRY",
  Russia: "RUB",
  Singapore: "SGD",
  "Hong Kong": "HKD",
  Taiwan: "TWD",
  Thailand: "THB",
  Indonesia: "IDR",
  Malaysia: "MYR",
  Philippines: "PHP",
  Chile: "CLP",
  Colombia: "COP",
  Peru: "PEN",
  Argentina: "ARS",
  Israel: "ILS",
  "Czech Republic": "CZK",
  Hungary: "HUF",
  Romania: "RON",
  Austria: "EUR",
  Belgium: "EUR",
  Finland: "EUR",
  Greece: "EUR",
  Ireland: "EUR",
  Netherlands: "EUR",
  Portugal: "EUR",
};

// ─── Helpers ────────────────────────────────────────────────

/**
 * Gera ID determinístico SHA-1 a partir de currency + timestamp + title.
 * Garante idempotência e deduplicação de eventos.
 */
export function generateDeterministicId(
  currency: string,
  timestamp: string,
  title: string,
): string {
  const input = `${currency}|${timestamp}|${title}`;
  return createHash("sha1").update(input).digest("hex");
}

/**
 * Converte um timestamp para ISO 8601 com offset UTC-3.
 * Se o timestamp já contém informação de timezone, converte para UTC-3.
 * Se não, assume que está em UTC e converte.
 */
export function toUtcMinus3(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return dateStr;
  }

  // Calcular o tempo em UTC-3
  const utcMs = date.getTime();
  const utcMinus3Ms = utcMs + UTC_MINUS_3_OFFSET_MS;
  const utcMinus3Date = new Date(utcMinus3Ms);

  // Formatar como ISO 8601 com offset -03:00
  const year = utcMinus3Date.getUTCFullYear();
  const month = String(utcMinus3Date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utcMinus3Date.getUTCDate()).padStart(2, "0");
  const hours = String(utcMinus3Date.getUTCHours()).padStart(2, "0");
  const minutes = String(utcMinus3Date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(utcMinus3Date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-03:00`;
}

/**
 * Mapeia importância numérica do Trading Economics para ImpactLevel.
 * TE usa: 1 = Low, 2 = Medium, 3 = High
 */
export function mapTeImportance(importance: number): ImpactLevel {
  switch (importance) {
    case 3:
      return "HIGH";
    case 2:
      return "MEDIUM";
    default:
      return "LOW";
  }
}

/**
 * Mapeia string de impacto do Finnhub para ImpactLevel.
 * Finnhub usa: "high", "medium", "low"
 */
export function mapFinnhubImpact(impact: string): ImpactLevel {
  const normalized = impact.toLowerCase().trim();
  switch (normalized) {
    case "high":
      return "HIGH";
    case "medium":
      return "MEDIUM";
    default:
      return "LOW";
  }
}

/**
 * Extrai valor numérico de strings como "0.5%", "ARS2307.48B", "178K", etc.
 * Retorna null se não conseguir parsear.
 */
export function parseNumericValue(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return isNaN(value) ? null : value;
  }

  // Remover caracteres não-numéricos exceto ponto, vírgula, sinal negativo
  const cleaned = value.replace(/[^0-9.\-,]/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-") {
    return null;
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Resolve a moeda para um evento do Trading Economics.
 * Prioriza o campo Currency da resposta, depois mapeia pelo país.
 */
function resolveTeCurrency(raw: TradingEconomicsRawEvent): string {
  if (raw.Currency && raw.Currency.trim().length > 0) {
    return raw.Currency.trim().toUpperCase();
  }
  return COUNTRY_NAME_TO_CURRENCY[raw.Country] ?? "UNKNOWN";
}

/**
 * Resolve a moeda para um evento do Finnhub.
 * O campo unit do Finnhub às vezes contém a moeda (ex: "AUD"),
 * mas geralmente contém a unidade (ex: "%").
 * Prioriza mapeamento por país.
 */
function resolveFinnhubCurrency(raw: FinnhubRawEvent): string {
  // Primeiro tenta pelo país
  const fromCountry = COUNTRY_TO_CURRENCY[raw.country];
  if (fromCountry) {
    return fromCountry;
  }

  // Fallback: se unit parece ser uma moeda (3 letras maiúsculas)
  if (raw.unit && /^[A-Z]{3}$/.test(raw.unit)) {
    return raw.unit;
  }

  return "UNKNOWN";
}

// ─── Normalização Principal ─────────────────────────────────

/**
 * Normaliza um evento bruto do Trading Economics para o formato interno.
 */
export function normalizeTradingEconomicsEvent(
  raw: TradingEconomicsRawEvent,
): EconomicEventNormalized {
  const currency = resolveTeCurrency(raw);
  const timestamp = toUtcMinus3(raw.Date);
  const title = raw.Event || raw.Category || "Unknown Event";

  return {
    id: generateDeterministicId(currency, timestamp, title),
    timestamp,
    country: raw.Country,
    currency,
    title,
    impact: mapTeImportance(raw.Importance),
    previous: parseNumericValue(raw.Previous),
    forecast: parseNumericValue(raw.Forecast),
    actual: parseNumericValue(raw.Actual),
    source: "TE",
    updated_at: raw.LastUpdate
      ? toUtcMinus3(raw.LastUpdate)
      : new Date().toISOString(),
    raw,
  };
}

/**
 * Normaliza um evento bruto do Finnhub para o formato interno.
 */
export function normalizeFinnhubEvent(
  raw: FinnhubRawEvent,
): EconomicEventNormalized {
  const currency = resolveFinnhubCurrency(raw);
  const timestamp = toUtcMinus3(raw.time);
  const title = raw.event || "Unknown Event";

  return {
    id: generateDeterministicId(currency, timestamp, title),
    timestamp,
    country: raw.country,
    currency,
    title,
    impact: mapFinnhubImpact(raw.impact),
    previous: raw.prev,
    forecast: raw.estimate,
    actual: raw.actual,
    source: "FINNHUB",
    updated_at: new Date().toISOString(),
    raw,
  };
}

/**
 * Ordena eventos normalizados por timestamp (ascendente).
 */
export function sortEventsByTimestamp(
  events: EconomicEventNormalized[],
): EconomicEventNormalized[] {
  return [...events].sort((a, b) => {
    const dateA = new Date(a.timestamp).getTime();
    const dateB = new Date(b.timestamp).getTime();
    return dateA - dateB;
  });
}
