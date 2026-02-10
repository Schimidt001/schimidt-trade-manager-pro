// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Trading Economics Calendar Provider
// Provider REAL de calendário econômico via API REST oficial
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
const DEFAULT_TIMEOUT_MS = 5_000;

/** Duração do cache (ms) — 15 minutos */
const CACHE_DURATION_MS = 15 * 60 * 1000;

/** Delay para retry com backoff (ms) */
const RETRY_DELAY_MS = 1_000;

// ─── Cache Simples ──────────────────────────────────────────

interface CacheEntry {
  data: EconomicEventNormalized[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Limpa entradas expiradas do cache.
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_DURATION_MS) {
      cache.delete(key);
    }
  }
}

/**
 * Retorna dados do cache se válidos, ou null se expirados/inexistentes.
 */
function getCached(key: string): EconomicEventNormalized[] | null {
  cleanExpiredCache();
  const entry = cache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > CACHE_DURATION_MS) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * Armazena dados no cache.
 */
function setCached(key: string, data: EconomicEventNormalized[]): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Limpa todo o cache (usado em testes).
 */
export function clearCache(): void {
  cache.clear();
}

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

/**
 * Sleep helper para retry com backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Fetch com Retry ────────────────────────────────────────

/**
 * Faz uma requisição HTTP com timeout e retry.
 */
async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  retries: number = 1,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const { controller, timeoutId } = createTimeoutController(timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof DOMException && error.name === "AbortError") {
        lastError = new Error(`[TE] Timeout após ${timeoutMs}ms`);
      } else if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error(`[TE] Erro desconhecido: ${String(error)}`);
      }

      // Se não for a última tentativa, aguardar antes de retry
      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS * (attempt + 1)); // backoff linear
      }
    }
  }

  throw lastError || new Error("[TE] Falha após todas as tentativas");
}

// ─── Health Check ───────────────────────────────────────────

/**
 * Verifica se a API Trading Economics está acessível.
 *
 * @param apiKey - Chave de API (ou "guest:guest")
 * @returns Status do provider
 */
export async function healthCheck(
  apiKey: string,
): Promise<{
  healthy: boolean;
  reason: string;
  message: string;
}> {
  const testDate = new Date();
  const dateStr = formatDateForTe(testDate);
  const url = `${TE_BASE_URL}/calendar/country/All/${dateStr}/${dateStr}?c=${encodeURIComponent(apiKey)}&f=json`;

  try {
    const response = await fetchWithRetry(url, DEFAULT_TIMEOUT_MS, 0); // sem retry no health check

    if (response.status === 401 || response.status === 403) {
      return {
        healthy: false,
        reason: "AUTH_FAILED",
        message: `[TE] Autenticação falhou (HTTP ${response.status})`,
      };
    }

    if (!response.ok) {
      return {
        healthy: false,
        reason: "HTTP_ERROR",
        message: `[TE] HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data: unknown = await response.json();

    if (!Array.isArray(data)) {
      return {
        healthy: false,
        reason: "INVALID_RESPONSE",
        message: "[TE] Resposta não é um array",
      };
    }

    return {
      healthy: true,
      reason: "OK",
      message: "[TE] Provider OK",
    };
  } catch (error: unknown) {
    return {
      healthy: false,
      reason: "NETWORK_ERROR",
      message: `[TE] Erro de rede: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ─── Fetch Principal ────────────────────────────────────────

/**
 * Busca eventos do calendário econômico para um dia específico
 * usando a API Trading Economics.
 *
 * Endpoint: GET /calendar/country/All/{date}/{date}?c={apiKey}&f=json
 *
 * Implementa:
 * - Cache de 15 minutos
 * - Timeout de 5 segundos
 * - 1 retry com backoff
 * - Suporte a guest:guest (fallback se apiKey vazia)
 *
 * @param date - Data alvo (Date object)
 * @param apiKey - Chave de API do Trading Economics (ou vazio para guest:guest)
 * @returns Array de eventos normalizados, ordenados por horário
 * @throws Error se a requisição falhar ou retornar status != 200
 */
export async function fetchCalendarDay(
  date: Date,
  apiKey: string,
): Promise<EconomicEventNormalized[]> {
  // Fallback para guest:guest se apiKey vazia
  const effectiveApiKey =
    apiKey && apiKey.trim().length > 0 ? apiKey : "guest:guest";

  const dateStr = formatDateForTe(date);
  const cacheKey = `te:${dateStr}:${effectiveApiKey}`;

  // Verificar cache
  const cached = getCached(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const url = `${TE_BASE_URL}/calendar/country/All/${dateStr}/${dateStr}?c=${encodeURIComponent(effectiveApiKey)}&f=json`;

  try {
    const response = await fetchWithRetry(url, DEFAULT_TIMEOUT_MS, 1);

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `[TE] Autenticação falhou (HTTP ${response.status}). Verifique TRADING_ECONOMICS_API_KEY ou use guest:guest.`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `[TE] HTTP ${response.status}: ${response.statusText} — URL: ${url}`,
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
    const sorted = sortEventsByTimestamp(normalized);

    // Armazenar no cache
    setCached(cacheKey, sorted);

    return sorted;
  } catch (error: unknown) {
    // Propagar erro original
    throw error;
  }
}
