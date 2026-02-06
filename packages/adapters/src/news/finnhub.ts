// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Finnhub Provider
// Provider fallback de calendário econômico via API REST oficial
// ═════════════════════════════════════════════════════════════

import type {
  EconomicEventNormalized,
  FinnhubCalendarResponse,
} from "./types";
import { normalizeFinnhubEvent, sortEventsByTimestamp } from "./normalize";

// ─── Constantes ─────────────────────────────────────────────

/** URL base da API Finnhub */
const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

/** Timeout padrão para requisições HTTP (ms) */
const DEFAULT_TIMEOUT_MS = 15_000;

// ─── Helpers ────────────────────────────────────────────────

/**
 * Formata uma data para o formato esperado pela API Finnhub (YYYY-MM-DD).
 */
function formatDateForFinnhub(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Cria um AbortController com timeout.
 */
function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

// ─── Fetch Principal ────────────────────────────────────────

/**
 * Busca eventos do calendário econômico para um dia específico
 * usando a API Finnhub.
 *
 * Endpoint: GET /calendar/economic?from={date}&to={date}&token={apiKey}
 *
 * @param date - Data alvo (Date object)
 * @param apiKey - Chave de API do Finnhub
 * @returns Array de eventos normalizados, ordenados por horário
 * @throws Error se a requisição falhar ou retornar status != 200
 */
export async function fetchCalendarDay(
  date: Date,
  apiKey: string,
): Promise<EconomicEventNormalized[]> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("[FINNHUB] FINNHUB_API_KEY não configurada ou vazia");
  }

  const dateStr = formatDateForFinnhub(date);
  const url = `${FINNHUB_BASE_URL}/calendar/economic?from=${dateStr}&to=${dateStr}&token=${encodeURIComponent(apiKey)}`;

  const { controller, timeoutId } = createTimeoutController(DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `[FINNHUB] HTTP ${response.status}: ${response.statusText} — endpoint: /calendar/economic`,
      );
    }

    const rawData: unknown = await response.json();

    // Finnhub retorna { economicCalendar: [...] }
    if (
      !rawData ||
      typeof rawData !== "object" ||
      !("economicCalendar" in rawData)
    ) {
      throw new Error(
        `[FINNHUB] Resposta inesperada: campo "economicCalendar" ausente`,
      );
    }

    const calendarResponse = rawData as FinnhubCalendarResponse;
    const rawEvents = calendarResponse.economicCalendar;

    if (!Array.isArray(rawEvents)) {
      throw new Error(
        `[FINNHUB] Resposta inesperada: "economicCalendar" não é array`,
      );
    }

    // Filtrar eventos que tenham pelo menos os campos essenciais
    const validEvents = rawEvents.filter(
      (evt) =>
        evt.time &&
        evt.event &&
        evt.impact !== undefined &&
        evt.impact !== null,
    );

    // Normalizar e ordenar por horário
    const normalized = validEvents.map(normalizeFinnhubEvent);
    return sortEventsByTimestamp(normalized);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `[FINNHUB] Timeout após ${DEFAULT_TIMEOUT_MS}ms ao buscar calendário para ${dateStr}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
