// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Fetch Candles (Yahoo Finance)
// Busca candles OHLC reais de FOREX via Yahoo Finance API.
//
// Responsabilidades:
// - Fetch de candles por símbolo e timeframe
// - Normalização do formato bruto para RawOhlcCandle
// - Retry com backoff em caso de falha
// - Logging estruturado de erros
//
// Regras:
// - FOREX APENAS (pares majors)
// - Não faz scraping — usa API pública
// - Não persiste cache (stateless)
// ═════════════════════════════════════════════════════════════

import type {
  RawOhlcCandle,
  MarketTimeframe,
  TimeframeConfig,
  FetchResult,
  MarketDataSnapshot,
} from "./types";
import { SYMBOL_TO_YAHOO } from "./types";

// ─── Constantes ─────────────────────────────────────────────

/**
 * Configuração de timeframes para o Yahoo Finance.
 * Mapeia cada timeframe para os parâmetros da API.
 */
const TIMEFRAME_CONFIGS: Readonly<Record<MarketTimeframe, TimeframeConfig>> = {
  M15: { interval: "15m", range: "5d", minBars: 2 },
  H1: { interval: "60m", range: "5d", minBars: 3 },
  H4: { interval: "60m", range: "1mo", minBars: 1 },  // Agregado de H1
  D1: { interval: "1d", range: "1mo", minBars: 1 },
};

/** Timeout para requests HTTP (ms) */
const FETCH_TIMEOUT_MS = 15000;

/** Máximo de retries */
const MAX_RETRIES = 2;

/** Base URL da API Yahoo Finance (via fetch nativo) */
const YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

// ─── Helpers ────────────────────────────────────────────────

/**
 * Aguarda um tempo em ms (para retry backoff).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Converte timestamp Unix (seconds) para ISO 8601 UTC.
 */
function unixToISO(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Agrega candles H1 em candles H4.
 * Agrupa por janelas de 4 horas (0-3, 4-7, 8-11, 12-15, 16-19, 20-23).
 */
function aggregateToH4(h1Candles: readonly RawOhlcCandle[]): RawOhlcCandle[] {
  if (h1Candles.length === 0) return [];

  const groups = new Map<string, RawOhlcCandle[]>();

  for (const candle of h1Candles) {
    const date = new Date(candle.timestamp * 1000);
    const hour = date.getUTCHours();
    const h4Block = Math.floor(hour / 4);
    const dayKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${h4Block}`;

    if (!groups.has(dayKey)) {
      groups.set(dayKey, []);
    }
    groups.get(dayKey)!.push(candle);
  }

  const result: RawOhlcCandle[] = [];
  for (const [, candles] of groups) {
    if (candles.length === 0) continue;
    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
    result.push({
      timestamp: sorted[0].timestamp,
      open: sorted[0].open,
      high: Math.max(...sorted.map((c) => c.high)),
      low: Math.min(...sorted.map((c) => c.low)),
      close: sorted[sorted.length - 1].close,
      volume: sorted.reduce((sum, c) => sum + c.volume, 0),
    });
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Fetch Individual ───────────────────────────────────────

/**
 * Busca candles de um símbolo/timeframe específico do Yahoo Finance.
 * Usa fetch nativo do Node.js (18+).
 *
 * @param internalSymbol - Símbolo interno (ex: "EURUSD")
 * @param timeframe - Timeframe desejado
 * @returns FetchResult com candles normalizados
 * @throws Error se o fetch falhar após retries
 */
async function fetchTimeframe(
  internalSymbol: string,
  timeframe: MarketTimeframe
): Promise<FetchResult> {
  const yahooSymbol = SYMBOL_TO_YAHOO[internalSymbol];
  if (!yahooSymbol) {
    throw new Error(`[MarketData] Símbolo não mapeado: ${internalSymbol}`);
  }

  // H4 é agregado de H1 — buscar H1 com range maior
  const effectiveTimeframe = timeframe === "H4" ? "H4" : timeframe;
  const config = TIMEFRAME_CONFIGS[effectiveTimeframe];

  const url = `${YAHOO_BASE_URL}/${encodeURIComponent(yahooSymbol)}?interval=${config.interval}&range=${config.range}&includeAdjustedClose=false`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * attempt); // Backoff: 1s, 2s
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "SchimidtBrain/1.0",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as {
        chart?: {
          result?: Array<{
            timestamp?: number[];
            indicators?: {
              quote?: Array<{
                open?: (number | null)[];
                high?: (number | null)[];
                low?: (number | null)[];
                close?: (number | null)[];
                volume?: (number | null)[];
              }>;
            };
          }>;
          error?: { code?: string; description?: string };
        };
      };

      if (data.chart?.error) {
        throw new Error(`Yahoo API error: ${data.chart.error.description ?? data.chart.error.code}`);
      }

      const result = data.chart?.result?.[0];
      if (!result?.timestamp || !result.indicators?.quote?.[0]) {
        throw new Error(`[MarketData] Dados vazios para ${internalSymbol} ${timeframe}`);
      }

      const timestamps = result.timestamp;
      const quotes = result.indicators.quote[0];
      const candles: RawOhlcCandle[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const open = quotes.open?.[i];
        const high = quotes.high?.[i];
        const low = quotes.low?.[i];
        const close = quotes.close?.[i];
        const volume = quotes.volume?.[i] ?? 0;

        // Pular candles com dados nulos
        if (open == null || high == null || low == null || close == null) {
          continue;
        }

        candles.push({
          timestamp: timestamps[i],
          open,
          high,
          low,
          close,
          volume,
        });
      }

      // Para H4, agregar os candles H1
      const finalCandles = timeframe === "H4" ? aggregateToH4(candles) : candles;

      return {
        symbol: internalSymbol,
        timeframe,
        candles: finalCandles,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[MarketData] Tentativa ${attempt + 1}/${MAX_RETRIES + 1} falhou para ${internalSymbol} ${timeframe}: ${lastError.message}`
      );
    }
  }

  throw new Error(
    `[MarketData] Falha ao buscar ${internalSymbol} ${timeframe} após ${MAX_RETRIES + 1} tentativas: ${lastError?.message}`
  );
}

// ─── Fetch Completo ─────────────────────────────────────────

/**
 * Busca todos os timeframes necessários para um símbolo.
 * Retorna um MarketDataSnapshot completo.
 *
 * @param symbol - Símbolo interno (ex: "EURUSD")
 * @returns MarketDataSnapshot com candles de todos os timeframes
 */
export async function fetchMarketData(
  symbol: string
): Promise<MarketDataSnapshot> {
  // Buscar M15, H1 e D1 em paralelo
  // H4 é derivado de H1 (range maior)
  const [m15Result, h1Result, h1ForH4Result, d1Result] = await Promise.all([
    fetchTimeframe(symbol, "M15"),
    fetchTimeframe(symbol, "H1"),
    fetchTimeframe(symbol, "H4"),
    fetchTimeframe(symbol, "D1"),
  ]);

  return {
    symbol,
    fetchedAt: new Date().toISOString(),
    D1: d1Result.candles,
    H4: h1ForH4Result.candles,
    H1: h1Result.candles,
    M15: m15Result.candles,
  };
}

/**
 * Busca dados de mercado para múltiplos símbolos.
 * Executa em paralelo para performance.
 *
 * @param symbols - Lista de símbolos internos
 * @returns Map de símbolo → MarketDataSnapshot
 */
export async function fetchMultipleMarketData(
  symbols: readonly string[]
): Promise<Map<string, MarketDataSnapshot>> {
  const results = new Map<string, MarketDataSnapshot>();

  // Executar em paralelo com controle de concorrência
  const promises = symbols.map(async (symbol) => {
    try {
      const snapshot = await fetchMarketData(symbol);
      return { symbol, snapshot, error: null };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[MarketData] Erro ao buscar ${symbol}: ${err.message}`);
      return { symbol, snapshot: null, error: err };
    }
  });

  const settled = await Promise.all(promises);

  for (const result of settled) {
    if (result.snapshot) {
      results.set(result.symbol, result.snapshot);
    }
  }

  return results;
}

// ─── Exports auxiliares ─────────────────────────────────────

export { unixToISO };
