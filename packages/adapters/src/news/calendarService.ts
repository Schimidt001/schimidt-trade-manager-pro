// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Calendar Service
// Interface principal consumida pela API (Agente 4)
//
// Responsabilidades:
// - getDayCalendar: TE primário, Finnhub fallback
// - getNextHighImpactEvent: próximo evento HIGH impact
// - computeEventWindows: janelas no-trade para eventos HIGH
//
// Regras institucionais:
// - Se TE falhar → tenta Finnhub
// - Se ambos falharem → provider DOWN
// - Se provider != OK → emitir PROVIDER_STATE_CHANGE
// ═════════════════════════════════════════════════════════════

import { ReasonCode } from "@schimidt-brain/contracts";
import type {
  EconomicEventNormalized,
  EventWindow,
  CalendarServiceResponse,
  DataSource,
} from "./types";
import { fetchCalendarDay as fetchTe } from "./tradingEconomics";
import { fetchCalendarDay as fetchFinnhub } from "./finnhub";
import { evaluateProviderHealth } from "./providerHealth";

// ─── Constantes ─────────────────────────────────────────────

/** Minutos antes do evento para início da janela NO_TRADE_SENSITIVE */
const WINDOW_PRE_MINUTES = 30;

/** Minutos após o evento para fim da janela NO_TRADE_SENSITIVE / início CONDITIONAL_ONLY */
const WINDOW_POST_SENSITIVE_MINUTES = 20;

/** Minutos após o evento para fim da janela CONDITIONAL_ONLY */
const WINDOW_POST_CONDITIONAL_MINUTES = 60;

// ─── Helpers ────────────────────────────────────────────────

/**
 * Adiciona minutos a um timestamp ISO 8601.
 */
function addMinutes(isoTimestamp: string, minutes: number): string {
  const date = new Date(isoTimestamp);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

/**
 * Converte uma data para o início do dia no timezone especificado.
 * O timezone é um offset string como "-03:00".
 */
function getDateForTimezone(date: Date, _timezone: string): Date {
  // Retorna a data tal como está — a normalização já aplica UTC-3
  return date;
}

// ─── getDayCalendar ─────────────────────────────────────────

/**
 * Obtém o calendário econômico do dia com fallback automático.
 *
 * Fluxo:
 * 1. Tenta Trading Economics (provider primário)
 * 2. Se TE falhar → tenta Finnhub (fallback)
 * 3. Se ambos falharem → retorna provider DOWN
 * 4. Avalia saúde do provider usado
 * 5. Retorna eventos + estado do provider
 *
 * @param date - Data alvo (Date object)
 * @param timezone - Offset timezone (default: "-03:00")
 * @returns CalendarServiceResponse com eventos e estado do provider
 */
export async function getDayCalendar(
  date: Date,
  timezone: string = "-03:00",
): Promise<CalendarServiceResponse> {
  const targetDate = getDateForTimezone(date, timezone);

  const teApiKey = process.env.TRADING_ECONOMICS_API_KEY ?? "";
  const finnhubApiKey = process.env.FINNHUB_API_KEY ?? "";

  let events: EconomicEventNormalized[] | null = null;
  let providerUsed: DataSource = "TE";
  let teError: Error | null = null;
  let finnhubError: Error | null = null;

  // ─── Tentativa 1: Trading Economics (primário) ────────────
  if (teApiKey.length > 0) {
    try {
      events = await fetchTe(targetDate, teApiKey);
      providerUsed = "TE";
    } catch (error: unknown) {
      teError = error instanceof Error ? error : new Error(String(error));
      events = null;
    }
  } else {
    teError = new Error("[TE] TRADING_ECONOMICS_API_KEY não configurada");
  }

  // ─── Tentativa 2: Finnhub (fallback) ─────────────────────
  if (events === null) {
    if (finnhubApiKey.length > 0) {
      try {
        events = await fetchFinnhub(targetDate, finnhubApiKey);
        providerUsed = "FINNHUB";
      } catch (error: unknown) {
        finnhubError =
          error instanceof Error ? error : new Error(String(error));
        events = null;
      }
    } else {
      finnhubError = new Error("[FINNHUB] FINNHUB_API_KEY não configurada");
    }
  }

  // ─── Ambos falharam → DOWN ────────────────────────────────
  if (events === null) {
    const combinedError = new Error(
      `Ambos providers falharam. TE: ${teError?.message ?? "N/A"} | Finnhub: ${finnhubError?.message ?? "N/A"}`,
    );

    return {
      events: [],
      provider_state: "DOWN",
      provider_used: providerUsed,
      reason_code: ReasonCode.PROV_DISCONNECTED,
      reason: combinedError.message,
    };
  }

  // ─── Avaliar saúde do provider ────────────────────────────
  const health = evaluateProviderHealth(events, targetDate);

  const response: CalendarServiceResponse = {
    events,
    provider_state: health.state,
    provider_used: providerUsed,
  };

  // Se usou fallback, registrar que houve failover
  if (providerUsed === "FINNHUB" && teError) {
    response.reason_code = ReasonCode.PROV_STATE_CHANGE;
    response.reason = `Failover para Finnhub: ${teError.message}`;

    // Se o fallback também está degradado, manter o reason_code do health
    if (health.state !== "OK") {
      response.reason_code = health.reason_code;
      response.reason = `Failover para Finnhub + ${health.reason}`;
    }
  } else if (health.state !== "OK") {
    response.reason_code = health.reason_code;
    response.reason = health.reason;
  }

  return response;
}

// ─── getNextHighImpactEvent ─────────────────────────────────

/**
 * Retorna o próximo evento de alto impacto a partir de um timestamp.
 *
 * Usado pela API para informar ao MCL/PM quando o próximo evento
 * HIGH impact ocorrerá, permitindo ajuste de posicionamento.
 *
 * @param events - Lista de eventos normalizados
 * @param now - Timestamp atual (ISO 8601 ou Date)
 * @returns Próximo evento HIGH impact, ou null se não houver
 */
export function getNextHighImpactEvent(
  events: EconomicEventNormalized[],
  now: string | Date,
): EconomicEventNormalized | null {
  const nowMs = new Date(now).getTime();

  const futureHighEvents = events
    .filter((e) => e.impact === "HIGH" && new Date(e.timestamp).getTime() > nowMs)
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

  return futureHighEvents.length > 0 ? futureHighEvents[0] : null;
}

// ─── computeEventWindows ────────────────────────────────────

/**
 * Computa janelas de restrição de trading para eventos HIGH impact.
 *
 * Para cada evento HIGH impact, gera duas janelas:
 *
 * 1. **NO_TRADE_SENSITIVE** (T-30 → T+20):
 *    Nenhuma operação sensível permitida. Período de maior incerteza
 *    antes e imediatamente após a divulgação do indicador.
 *
 * 2. **CONDITIONAL_ONLY** (T+20 → T+60):
 *    Apenas operações condicionais permitidas. Período de absorção
 *    do impacto pelo mercado, volatilidade ainda elevada.
 *
 * @param events - Lista de eventos normalizados
 * @returns Array de EventWindow para todos os eventos HIGH impact
 */
export function computeEventWindows(
  events: EconomicEventNormalized[],
): EventWindow[] {
  const windows: EventWindow[] = [];

  const highImpactEvents = events.filter((e) => e.impact === "HIGH");

  for (const event of highImpactEvents) {
    // Janela 1: T-30 → T+20 (NO_TRADE_SENSITIVE)
    windows.push({
      start: addMinutes(event.timestamp, -WINDOW_PRE_MINUTES),
      end: addMinutes(event.timestamp, WINDOW_POST_SENSITIVE_MINUTES),
      policy: "NO_TRADE_SENSITIVE",
      currency: event.currency,
      impact: event.impact,
    });

    // Janela 2: T+20 → T+60 (CONDITIONAL_ONLY)
    windows.push({
      start: addMinutes(event.timestamp, WINDOW_POST_SENSITIVE_MINUTES),
      end: addMinutes(event.timestamp, WINDOW_POST_CONDITIONAL_MINUTES),
      policy: "CONDITIONAL_ONLY",
      currency: event.currency,
      impact: event.impact,
    });
  }

  // Ordenar por início da janela
  windows.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  return windows;
}
