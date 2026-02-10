// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — FMP Calendar Provider
// Provider primário de calendário econômico via Financial Modeling Prep
//
// Endpoint: GET https://financialmodelingprep.com/stable/economic-calendar
// Params: from, to, apikey
//
// Requisitos institucionais:
// - Timeout curto (5s)
// - Retry limitado (1 retry com backoff exponencial)
// - Cache por janela do dia (15 min TTL)
// - Rate limit respeitado (free tier)
// - Degradação elegante: DEGRADED/DOWN bem reportado
// ═════════════════════════════════════════════════════════════

import type {
  EconomicEventNormalized,
} from "./types";
import { normalizeFmpEvent, sortEventsByTimestamp } from "./normalize";

// ─── Constantes ─────────────────────────────────────────────

/** URL base da API FMP (stable endpoint) */
const FMP_BASE_URL = "https://financialmodelingprep.com/stable";

/** Timeout padrão para requisições HTTP (ms) — curto conforme diretriz */
const DEFAULT_TIMEOUT_MS = 5_000;

/** Número máximo de retries */
const MAX_RETRIES = 1;

/** Backoff base para retry (ms) */
const RETRY_BACKOFF_MS = 1_000;

/** TTL do cache em milissegundos (15 minutos) */
const CACHE_TTL_MS = 15 * 60 * 1_000;

/** Intervalo mínimo entre requests ao FMP (rate limit) — 2s */
const MIN_REQUEST_INTERVAL_MS = 2_000;

// ─── Raw FMP Event Type ─────────────────────────────────────

/**
 * Formato bruto de um evento retornado pela API FMP.
 */
export interface FmpRawEvent {
  date: string;
  country: string;
  event: string;
  currency: string;
  previous: number | null;
  estimate: number | null;
  actual: number | null;
  change: number | null;
  impact: string;
  changePercentage: number | null;
}

// ─── Cache In-Memory ────────────────────────────────────────

interface CacheEntry {
  events: EconomicEventNormalized[];
  fetchedAt: number;
  dateKey: string;
}

/** Cache simples em memória — chave é a data (YYYY-MM-DD) */
const _cache = new Map<string, CacheEntry>();

/** Timestamp do último request ao FMP */
let _lastRequestAt = 0;

/**
 * Limpa entradas expiradas do cache.
 */
function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of _cache.entries()) {
    if (now - entry.fetchedAt > CACHE_TTL_MS) {
      _cache.delete(key);
    }
  }
}

/**
 * Retorna eventos do cache se ainda válidos.
 */
function getFromCache(dateKey: string): EconomicEventNormalized[] | null {
  pruneCache();
  const entry = _cache.get(dateKey);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    _cache.delete(dateKey);
    return null;
  }
  return entry.events;
}

/**
 * Armazena eventos no cache.
 */
function setCache(dateKey: string, events: EconomicEventNormalized[]): void {
  _cache.set(dateKey, {
    events,
    fetchedAt: Date.now(),
    dateKey,
  });
}

// ─── Rate Limiter ───────────────────────────────────────────

/**
 * Aguarda o intervalo mínimo entre requests se necessário.
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - _lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    const waitMs = MIN_REQUEST_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  _lastRequestAt = Date.now();
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Formata uma data para o formato esperado pela API FMP (YYYY-MM-DD).
 */
function formatDateForFmp(date: Date): string {
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
 * Executa um fetch com retry e backoff exponencial.
 */
async function fetchWithRetry(
  url: string,
  maxRetries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = RETRY_BACKOFF_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }

    const { controller, timeoutId } = createTimeoutController(DEFAULT_TIMEOUT_MS);

    try {
      await waitForRateLimit();

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        // Rate limited — esperar mais antes do retry
        lastError = new Error(
          `[FMP] HTTP 429: Rate limit atingido — attempt ${attempt + 1}/${maxRetries + 1}`
        );
        _lastRequestAt = Date.now() + 5_000; // Penalidade extra
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `[FMP] HTTP ${response.status}: ${response.statusText} — endpoint: /stable/economic-calendar`
        );
      }

      return response;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof DOMException && error.name === "AbortError") {
        lastError = new Error(
          `[FMP] Timeout após ${DEFAULT_TIMEOUT_MS}ms — attempt ${attempt + 1}/${maxRetries + 1}`
        );
      } else if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error(String(error));
      }
    }
  }

  throw lastError ?? new Error("[FMP] Falha desconhecida após retries");
}

// ─── Fetch Principal ────────────────────────────────────────

/**
 * Busca eventos do calendário econômico para um dia específico
 * usando a API Financial Modeling Prep (FMP).
 *
 * Endpoint: GET /stable/economic-calendar?from={date}&to={date}&apikey={key}
 *
 * Funcionalidades:
 * - Cache em memória (15 min TTL) por dia
 * - Rate limiting (mínimo 2s entre requests)
 * - Retry com backoff exponencial (1 retry)
 * - Timeout curto (5s)
 *
 * @param date - Data alvo (Date object)
 * @param apiKey - Chave de API do FMP
 * @returns Array de eventos normalizados, ordenados por horário
 * @throws Error se a requisição falhar após retries
 */
export async function fetchCalendarDay(
  date: Date,
  apiKey: string,
): Promise<EconomicEventNormalized[]> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("[FMP] FMP_API_KEY não configurada ou vazia");
  }

  const dateStr = formatDateForFmp(date);

  // ─── Verificar cache ──────────────────────────────────────
  const cached = getFromCache(dateStr);
  if (cached !== null) {
    return cached;
  }

  // ─── Fetch da API ─────────────────────────────────────────
  const url = `${FMP_BASE_URL}/economic-calendar?from=${dateStr}&to=${dateStr}&apikey=${encodeURIComponent(apiKey)}`;

  const response = await fetchWithRetry(url);
  const rawData: unknown = await response.json();

  // FMP retorna array diretamente
  if (!Array.isArray(rawData)) {
    throw new Error(
      `[FMP] Resposta inesperada: esperava array, recebeu ${typeof rawData}`
    );
  }

  const rawEvents = rawData as FmpRawEvent[];

  // Filtrar eventos que tenham pelo menos os campos essenciais
  const validEvents = rawEvents.filter(
    (evt) =>
      evt.date &&
      evt.event &&
      evt.event.trim().length > 0 &&
      evt.currency &&
      evt.currency.trim().length > 0
  );

  // Normalizar e ordenar por horário
  const normalized = validEvents.map(normalizeFmpEvent);
  const sorted = sortEventsByTimestamp(normalized);

  // ─── Armazenar no cache ───────────────────────────────────
  setCache(dateStr, sorted);

  return sorted;
}

// ─── Health Check ───────────────────────────────────────────

/**
 * Resultado do health check do provider FMP.
 */
export interface FmpHealthCheckResult {
  state: "OK" | "DEGRADED" | "DOWN";
  message: string;
  latency_ms: number;
}

/**
 * Verifica a saúde do provider FMP fazendo uma requisição leve.
 *
 * @param apiKey - Chave de API do FMP
 * @returns Estado de saúde do provider
 */
export async function healthCheck(
  apiKey: string
): Promise<FmpHealthCheckResult> {
  if (!apiKey || apiKey.trim().length === 0) {
    return {
      state: "DOWN",
      message: "[FMP] FMP_API_KEY não configurada ou vazia",
      latency_ms: 0,
    };
  }

  const start = Date.now();
  const today = formatDateForFmp(new Date());
  const url = `${FMP_BASE_URL}/economic-calendar?from=${today}&to=${today}&apikey=${encodeURIComponent(apiKey)}`;

  const { controller, timeoutId } = createTimeoutController(DEFAULT_TIMEOUT_MS);

  try {
    await waitForRateLimit();

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - start;

    if (response.status === 429) {
      return {
        state: "DEGRADED",
        message: "[FMP] Rate limit atingido (HTTP 429)",
        latency_ms: latency,
      };
    }

    if (!response.ok) {
      return {
        state: "DOWN",
        message: `[FMP] HTTP ${response.status}: ${response.statusText}`,
        latency_ms: latency,
      };
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return {
        state: "DEGRADED",
        message: `[FMP] Resposta inesperada: esperava array, recebeu ${typeof data}`,
        latency_ms: latency,
      };
    }

    return {
      state: "OK",
      message: `[FMP] OK — ${data.length} eventos retornados em ${latency}ms`,
      latency_ms: latency,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const latency = Date.now() - start;

    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        state: "DOWN",
        message: `[FMP] Timeout após ${DEFAULT_TIMEOUT_MS}ms`,
        latency_ms: latency,
      };
    }

    const msg = error instanceof Error ? error.message : String(error);
    return {
      state: "DOWN",
      message: `[FMP] Erro: ${msg}`,
      latency_ms: latency,
    };
  }
}

// ─── Exports para testes ────────────────────────────────────

/**
 * Limpa o cache (para testes).
 */
export function clearCache(): void {
  _cache.clear();
}

/**
 * Retorna o tamanho atual do cache (para testes).
 */
export function getCacheSize(): number {
  return _cache.size;
}
