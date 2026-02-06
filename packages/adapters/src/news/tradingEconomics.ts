// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Trading Economics Provider
// Provider primário de calendário econômico via API REST oficial
// ═════════════════════════════════════════════════════════════

import type {
  EconomicEventNormalized,
  TradingEconomicsRawEvent,
} from "./types";
import {
  normalizeTradingEconomicsEvent,
  sortEventsByTimestamp,
} from "./normalize";

// ─── Constantes ─────────────────────────────────────────────

/** URL base da API Trading Economics */
const TE_BASE_URL = "https://api.tradingeconomics.com";

/** Timeout padrão para requisições HTTP (ms) */
const DEFAULT_TIMEOUT_MS = 15_000;

// ─── Helpers ────────────────────────────────────────────────

/**
 * Formata uma data para o formato esperado pela API TE (YYYY-MM-DD).
 */
function formatDateForTe(date: Date): string {
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
 * usando a API Trading Economics.
 *
 * Endpoint: GET /calendar/country/All/{date}/{date}?c={apiKey}&f=json
 *
 * @param date - Data alvo (Date object)
 * @param apiKey - Chave de API do Trading Economics
 * @returns Array de eventos normalizados, ordenados por horário
 * @throws Error se a requisição falhar ou retornar status != 200
 */
export async function fetchCalendarDay(
  date: Date,
  apiKey: string,
): Promise<EconomicEventNormalized[]> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "[TE] TRADING_ECONOMICS_API_KEY não configurada ou vazia",
    );
  }

  const dateStr = formatDateForTe(date);
  const url = `${TE_BASE_URL}/calendar/country/All/${dateStr}/${dateStr}?c=${encodeURIComponent(apiKey)}&f=json`;

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
        `[TE] HTTP ${response.status}: ${response.statusText} — URL: ${TE_BASE_URL}/calendar/country/All/${dateStr}/${dateStr}`,
      );
    }

    const rawData: unknown = await response.json();

    // TE retorna array diretamente
    if (!Array.isArray(rawData)) {
      throw new Error(
        `[TE] Resposta inesperada: esperava array, recebeu ${typeof rawData}`,
      );
    }

    const rawEvents = rawData as TradingEconomicsRawEvent[];

    // Filtrar eventos que tenham pelo menos os campos essenciais
    const validEvents = rawEvents.filter(
      (evt) =>
        evt.Date &&
        evt.Event &&
        evt.Importance !== undefined &&
        evt.Importance !== null,
    );

    // Normalizar e ordenar por horário
    const normalized = validEvents.map(normalizeTradingEconomicsEvent);
    return sortEventsByTimestamp(normalized);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `[TE] Timeout após ${DEFAULT_TIMEOUT_MS}ms ao buscar calendário para ${dateStr}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
