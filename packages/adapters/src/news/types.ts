// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — News Types
// Modelo interno normalizado para eventos econômicos
// ═════════════════════════════════════════════════════════════

import type { ReasonCodeType } from "@schimidt-brain/contracts";

// ─── Impact Level ───────────────────────────────────────────

/**
 * Nível de impacto normalizado do evento econômico.
 */
export type ImpactLevel = "HIGH" | "MEDIUM" | "LOW";

// ─── Data Source ────────────────────────────────────────────

/**
 * Fonte de dados do evento.
 */
export type DataSource = "TE" | "FINNHUB";

// ─── Provider State ─────────────────────────────────────────

/**
 * Estado de saúde do provider de notícias.
 *
 * OK       — dados completos e confiáveis
 * DEGRADED — dados parciais ou com campos faltando
 * DOWN     — fetch falhou em ambos os providers
 */
export type ProviderState = "OK" | "DEGRADED" | "DOWN";

// ─── Event Window Policy ────────────────────────────────────

/**
 * Política de trading durante janela de evento.
 *
 * NO_TRADE_SENSITIVE — nenhuma operação sensível permitida (T-30 → T+20)
 * CONDITIONAL_ONLY   — apenas operações condicionais (T+20 → T+60)
 */
export type EventWindowPolicy = "NO_TRADE_SENSITIVE" | "CONDITIONAL_ONLY";

// ─── Normalized Economic Event ──────────────────────────────

/**
 * Evento econômico normalizado.
 * Formato interno único independente da fonte (TE ou Finnhub).
 *
 * O campo `id` é um hash SHA-1 determinístico de (currency + timestamp + title),
 * garantindo idempotência e deduplicação.
 */
export interface EconomicEventNormalized {
  /** Hash determinístico SHA-1(currency + timestamp + title) */
  id: string;

  /** Timestamp ISO 8601 do evento (com offset UTC-3 quando normalizado) */
  timestamp: string;

  /** País de origem do indicador (ex: "United States", "Brazil") */
  country: string;

  /** Moeda afetada (ex: "USD", "EUR", "JPY") */
  currency: string;

  /** Título/nome do evento econômico */
  title: string;

  /** Nível de impacto: HIGH | MEDIUM | LOW */
  impact: ImpactLevel;

  /** Valor anterior do indicador (null se indisponível) */
  previous: number | null;

  /** Previsão/consenso do mercado (null se indisponível) */
  forecast: number | null;

  /** Valor real publicado (null se ainda não divulgado) */
  actual: number | null;

  /** Fonte de dados: TE (Trading Economics) ou FINNHUB */
  source: DataSource;

  /** Timestamp ISO 8601 da última atualização */
  updated_at: string;

  /** Dados brutos originais da API (opcional, para debug/auditoria) */
  raw?: unknown;
}

// ─── Event Window ───────────────────────────────────────────

/**
 * Janela temporal de restrição de trading em torno de um evento.
 *
 * Duas janelas são geradas para cada evento HIGH impact:
 *   1. T-30 → T+20: NO_TRADE_SENSITIVE (sem operações sensíveis)
 *   2. T+20 → T+60: CONDITIONAL_ONLY (apenas operações condicionais)
 */
export interface EventWindow {
  /** Início da janela (ISO 8601) */
  start: string;

  /** Fim da janela (ISO 8601) */
  end: string;

  /** Política de trading durante esta janela */
  policy: EventWindowPolicy;

  /** Moeda afetada pelo evento */
  currency: string;

  /** Nível de impacto do evento que gerou esta janela */
  impact: ImpactLevel;
}

// ─── Provider Health Result ─────────────────────────────────

/**
 * Resultado da avaliação de saúde do provider.
 * Usado para emitir PROVIDER_STATE_CHANGE via contracts.
 */
export interface ProviderHealthResult {
  /** Estado atual do provider */
  state: ProviderState;

  /** Código de razão canônico (do catálogo de contracts) */
  reason_code: ReasonCodeType;

  /** Mensagem humana explicando o estado */
  reason: string;
}

// ─── Calendar Service Response ──────────────────────────────

/**
 * Resposta completa do serviço de calendário.
 * Interface principal consumida pela API (Agente 4).
 */
export interface CalendarServiceResponse {
  /** Lista de eventos econômicos normalizados do dia */
  events: EconomicEventNormalized[];

  /** Estado de saúde do provider utilizado */
  provider_state: ProviderState;

  /** Provider que forneceu os dados: "TE" ou "FINNHUB" */
  provider_used: DataSource;

  /** Código de razão (presente se provider != OK) */
  reason_code?: ReasonCodeType;

  /** Mensagem de razão (presente se provider != OK) */
  reason?: string;
}

// ─── Raw API Response Types ─────────────────────────────────

/**
 * Formato bruto de um evento retornado pela API Trading Economics.
 */
export interface TradingEconomicsRawEvent {
  CalendarId: string | number;
  Date: string;
  Country: string;
  Category: string;
  Event: string;
  Reference?: string;
  ReferenceDate?: string;
  Source?: string;
  SourceURL?: string;
  Actual?: string | number | null;
  Previous?: string | number | null;
  Forecast?: string | number | null;
  TEForecast?: string | number | null;
  URL?: string;
  DateSpan?: number;
  Importance: number;
  LastUpdate?: string;
  Revised?: string | number | null;
  Currency?: string;
  Unit?: string;
  Ticker?: string;
  Symbol?: string;
}

/**
 * Formato bruto de um evento retornado pela API Finnhub.
 */
export interface FinnhubRawEvent {
  actual: number | null;
  country: string;
  estimate: number | null;
  event: string;
  impact: string;
  prev: number | null;
  time: string;
  unit: string;
}

/**
 * Resposta bruta da API Finnhub.
 */
export interface FinnhubCalendarResponse {
  economicCalendar: FinnhubRawEvent[];
}
