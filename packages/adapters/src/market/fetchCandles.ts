// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Fetch Candles (cTrader Open API)
// Busca candles OHLC reais de FOREX via cTrader Open API.
//
// Responsabilidades:
// - Conexão WebSocket JSON com cTrader backend
// - Autenticação App + Account (OAuth)
// - Resolução dinâmica de symbolId (com cache TTL)
// - Fetch de candles por símbolo e timeframe
// - Conversão de formato relativo cTrader para OHLC absoluto
// - Data Quality Gate (gaps, stale, market closed)
// - Retry com backoff em caso de falha
// - Heartbeat para manter conexão viva
//
// Regras:
// - FOREX APENAS (pares majors)
// - Fonte: cTrader Open API (Spotware) — FX-grade
// - Não persiste cache (stateless, exceto symbol cache)
// ═════════════════════════════════════════════════════════════

import type {
  RawOhlcCandle,
  MarketTimeframe,
  FetchResult,
  MarketDataSnapshot,
  DataQualityResult,
} from "./types";
import {
  SYMBOL_TO_CTRADER,
  TIMEFRAME_TO_CTRADER_PERIOD,
} from "./types";
import WebSocket from "ws";

// ─── cTrader PayloadType Constants ─────────────────────────

const PAYLOAD = {
  HEARTBEAT_EVENT: 51,
  PROTO_OA_APPLICATION_AUTH_REQ: 2100,
  PROTO_OA_APPLICATION_AUTH_RES: 2101,
  PROTO_OA_ACCOUNT_AUTH_REQ: 2102,
  PROTO_OA_ACCOUNT_AUTH_RES: 2103,
  PROTO_OA_SYMBOLS_LIST_REQ: 2114,
  PROTO_OA_SYMBOLS_LIST_RES: 2115,
  PROTO_OA_GET_TRENDBARS_REQ: 2137,
  PROTO_OA_GET_TRENDBARS_RES: 2138,
  PROTO_OA_ERROR_RES: 2142,
  PROTO_OA_REFRESH_TOKEN_REQ: 2173,
  PROTO_OA_REFRESH_TOKEN_RES: 2174,
} as const;

// ─── Config from Environment ───────────────────────────────

interface CTraderConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  accountId: number;
  env: "LIVE" | "DEMO";
  timeoutMs: number;
}

function loadCTraderConfig(): CTraderConfig {
  const clientId = process.env.CTRADER_CLIENT_ID;
  const clientSecret = process.env.CTRADER_CLIENT_SECRET;
  const accessToken = process.env.CTRADER_ACCESS_TOKEN;
  const refreshToken = process.env.CTRADER_REFRESH_TOKEN;
  const accountId = process.env.CTRADER_CTID_TRADER_ACCOUNT_ID;
  const env = (process.env.CTRADER_ENV ?? "DEMO").toUpperCase();
  const timeoutMs = parseInt(process.env.MARKET_DATA_TIMEOUT_MS ?? "5000", 10);

  if (!clientId || !clientSecret || !accessToken || !accountId) {
    throw new Error(
      "[cTrader] Variáveis de ambiente obrigatórias não definidas: " +
      "CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_ACCESS_TOKEN, CTRADER_CTID_TRADER_ACCOUNT_ID"
    );
  }

  return {
    clientId,
    clientSecret,
    accessToken,
    refreshToken: refreshToken ?? "",
    accountId: parseInt(accountId, 10),
    env: env === "LIVE" ? "LIVE" : "DEMO",
    timeoutMs,
  };
}

// ─── Connection State ──────────────────────────────────────

let _ws: WebSocket | null = null;
let _authenticated = false;
let _config: CTraderConfig | null = null;
let _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let _msgCounter = 0;
let _pendingRequests = new Map<string, {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

// Symbol ID cache: symbolName → { symbolId, digits, fetchedAt }
let _symbolCache = new Map<string, { symbolId: number; digits: number; fetchedAt: number }>();
const SYMBOL_CACHE_TTL_MS = 3600000; // 1 hora

// ─── Helpers ───────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextMsgId(): string {
  return `msg_${++_msgCounter}_${Date.now()}`;
}

/**
 * Converte timestamp Unix (seconds) para ISO 8601 UTC.
 */
function unixToISO(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

// ─── WebSocket Connection ──────────────────────────────────

function getWsUrl(config: CTraderConfig): string {
  const host = config.env === "LIVE"
    ? "live.ctraderapi.com"
    : "demo.ctraderapi.com";
  return `wss://${host}:5036`;
}

function sendMessage(payloadType: number, payload: Record<string, unknown>, clientMsgId?: string): string {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) {
    throw new Error("[cTrader] WebSocket não está conectado");
  }

  const msgId = clientMsgId ?? nextMsgId();
  const message = JSON.stringify({
    clientMsgId: msgId,
    payloadType,
    payload,
  });

  _ws.send(message);
  return msgId;
}

function sendAndWait(payloadType: number, payload: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
  const config = _config ?? loadCTraderConfig();
  const timeout = timeoutMs ?? config.timeoutMs;
  const msgId = nextMsgId();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pendingRequests.delete(msgId);
      reject(new Error(`[cTrader] Timeout (${timeout}ms) aguardando resposta para ${msgId}`));
    }, timeout);

    _pendingRequests.set(msgId, { resolve, reject, timer });
    sendMessage(payloadType, payload, msgId);
  });
}

function handleMessage(raw: string): void {
  let parsed: { clientMsgId?: string; payloadType?: number; payload?: Record<string, unknown> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[cTrader] Mensagem não-JSON recebida:", raw.substring(0, 200));
    return;
  }

  const { clientMsgId, payloadType, payload } = parsed;

  // Heartbeat response — ignorar
  if (payloadType === PAYLOAD.HEARTBEAT_EVENT) {
    return;
  }

  // Error response
  if (payloadType === PAYLOAD.PROTO_OA_ERROR_RES) {
    const errorCode = payload?.errorCode ?? "UNKNOWN";
    const description = payload?.description ?? "Erro desconhecido";
    console.error(`[cTrader] Erro: ${errorCode} — ${description}`);

    if (clientMsgId && _pendingRequests.has(clientMsgId)) {
      const pending = _pendingRequests.get(clientMsgId)!;
      clearTimeout(pending.timer);
      _pendingRequests.delete(clientMsgId);
      pending.reject(new Error(`[cTrader] ${errorCode}: ${description}`));
    }
    return;
  }

  // Resolve pending request
  if (clientMsgId && _pendingRequests.has(clientMsgId)) {
    const pending = _pendingRequests.get(clientMsgId)!;
    clearTimeout(pending.timer);
    _pendingRequests.delete(clientMsgId);
    pending.resolve({ payloadType, payload });
  }
}

async function connect(): Promise<void> {
  if (_ws && _ws.readyState === WebSocket.OPEN && _authenticated) {
    return; // Já conectado e autenticado
  }

  // Limpar conexão anterior
  await disconnect();

  _config = loadCTraderConfig();
  const wsUrl = getWsUrl(_config);

  return new Promise((resolve, reject) => {
    const connectTimeout = setTimeout(() => {
      reject(new Error(`[cTrader] Timeout ao conectar em ${wsUrl}`));
    }, 10000);

    _ws = new WebSocket(wsUrl);

    _ws.on("open", async () => {
      clearTimeout(connectTimeout);
      console.log(`[cTrader] WebSocket conectado a ${wsUrl}`);

      try {
        await authenticate();
        startHeartbeat();
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    _ws.on("message", (data: WebSocket.Data) => {
      handleMessage(data.toString());
    });

    _ws.on("error", (err) => {
      console.error("[cTrader] WebSocket error:", err.message);
      clearTimeout(connectTimeout);
    });

    _ws.on("close", (code, reason) => {
      console.warn(`[cTrader] WebSocket fechado: ${code} ${reason.toString()}`);
      _authenticated = false;
      stopHeartbeat();
    });
  });
}

async function authenticate(): Promise<void> {
  if (!_config) throw new Error("[cTrader] Config não carregada");

  // 1. Application Auth
  const appAuthRes = await sendAndWait(
    PAYLOAD.PROTO_OA_APPLICATION_AUTH_REQ,
    {
      clientId: _config.clientId,
      clientSecret: _config.clientSecret,
    },
    10000
  ) as { payloadType: number };

  if (appAuthRes.payloadType !== PAYLOAD.PROTO_OA_APPLICATION_AUTH_RES) {
    throw new Error("[cTrader] Falha na autenticação da aplicação");
  }
  console.log("[cTrader] Aplicação autenticada");

  // 2. Account Auth
  const accAuthRes = await sendAndWait(
    PAYLOAD.PROTO_OA_ACCOUNT_AUTH_REQ,
    {
      ctidTraderAccountId: _config.accountId,
      accessToken: _config.accessToken,
    },
    10000
  ) as { payloadType: number };

  if (accAuthRes.payloadType !== PAYLOAD.PROTO_OA_ACCOUNT_AUTH_RES) {
    throw new Error("[cTrader] Falha na autenticação da conta");
  }

  _authenticated = true;
  console.log(`[cTrader] Conta ${_config.accountId} autenticada`);
}

function startHeartbeat(): void {
  stopHeartbeat();
  _heartbeatInterval = setInterval(() => {
    try {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        sendMessage(PAYLOAD.HEARTBEAT_EVENT, {});
      }
    } catch {
      // Ignorar erros de heartbeat
    }
  }, 10000); // A cada 10 segundos
}

function stopHeartbeat(): void {
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }
}

async function disconnect(): Promise<void> {
  stopHeartbeat();
  _authenticated = false;

  // Rejeitar todas as requests pendentes
  for (const [, pending] of _pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(new Error("[cTrader] Conexão encerrada"));
  }
  _pendingRequests.clear();

  if (_ws) {
    try {
      _ws.close();
    } catch {
      // Ignorar
    }
    _ws = null;
  }
}

async function ensureConnected(): Promise<void> {
  if (!_ws || _ws.readyState !== WebSocket.OPEN || !_authenticated) {
    await connect();
  }
}

// ─── Symbol Resolution ─────────────────────────────────────

/**
 * Resolve o symbolId numérico para um símbolo no cTrader.
 * Usa cache com TTL de 1 hora.
 * Se falhar, retorna null (NO_TRADE com reason, sem quebrar tick).
 */
async function resolveSymbolId(
  internalSymbol: string
): Promise<{ symbolId: number; digits: number } | null> {
  const ctraderName = SYMBOL_TO_CTRADER[internalSymbol];
  if (!ctraderName) {
    console.error(`[cTrader] Símbolo não mapeado: ${internalSymbol}`);
    return null;
  }

  // Verificar cache
  const cached = _symbolCache.get(ctraderName);
  if (cached && (Date.now() - cached.fetchedAt) < SYMBOL_CACHE_TTL_MS) {
    return { symbolId: cached.symbolId, digits: cached.digits };
  }

  // Buscar lista de símbolos
  try {
    await ensureConnected();

    const res = await sendAndWait(
      PAYLOAD.PROTO_OA_SYMBOLS_LIST_REQ,
      { ctidTraderAccountId: _config!.accountId },
      15000
    ) as { payloadType: number; payload: { symbol?: Array<{ symbolId: number; symbolName?: string; digits?: number }> } };

    if (res.payloadType !== PAYLOAD.PROTO_OA_SYMBOLS_LIST_RES || !res.payload?.symbol) {
      console.error("[cTrader] Resposta inválida para SymbolsListReq");
      return null;
    }

    // Cachear todos os símbolos
    const now = Date.now();
    for (const sym of res.payload.symbol) {
      if (sym.symbolName) {
        _symbolCache.set(sym.symbolName, {
          symbolId: sym.symbolId,
          digits: sym.digits ?? 5,
          fetchedAt: now,
        });
      }
    }

    // Buscar o símbolo desejado
    const found = _symbolCache.get(ctraderName);
    if (!found) {
      console.error(`[cTrader] Símbolo ${ctraderName} não encontrado na lista do broker`);
      return null;
    }

    return { symbolId: found.symbolId, digits: found.digits };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[cTrader] Erro ao resolver symbolId para ${ctraderName}: ${error.message}`);
    return null;
  }
}

// ─── Trendbar Conversion ───────────────────────────────────

/**
 * Converte trendbars do formato relativo cTrader para RawOhlcCandle[].
 *
 * cTrader retorna preços em formato relativo:
 * - low: preço low em unidades de 1/100000
 * - deltaOpen: delta do open em relação ao low
 * - deltaClose: delta do close em relação ao low
 * - deltaHigh: delta do high em relação ao low
 * - volume: volume em ticks
 * - utcTimestampInMinutes: timestamp em minutos UTC
 */
function convertTrendbars(
  trendbars: Array<{
    low?: number;
    deltaOpen?: number;
    deltaClose?: number;
    deltaHigh?: number;
    volume?: number;
    utcTimestampInMinutes?: number;
  }>,
  digits: number
): RawOhlcCandle[] {
  const candles: RawOhlcCandle[] = [];
  const factor = 100000;

  for (const bar of trendbars) {
    if (bar.low == null || bar.utcTimestampInMinutes == null) {
      continue; // Pular barras incompletas
    }

    const lowRaw = bar.low;
    const deltaOpen = bar.deltaOpen ?? 0;
    const deltaClose = bar.deltaClose ?? 0;
    const deltaHigh = bar.deltaHigh ?? 0;

    const low = parseFloat((lowRaw / factor).toFixed(digits));
    const open = parseFloat(((lowRaw + deltaOpen) / factor).toFixed(digits));
    const close = parseFloat(((lowRaw + deltaClose) / factor).toFixed(digits));
    const high = parseFloat(((lowRaw + deltaHigh) / factor).toFixed(digits));

    // Volume em ticks — em FOREX, volume real não é disponível (OTC)
    // Se volume é 0 ou ausente, usar 0 e marcar como volume_missing no quality gate
    const volume = bar.volume ?? 0;

    // Converter utcTimestampInMinutes para Unix seconds
    const timestamp = (bar.utcTimestampInMinutes ?? 0) * 60;

    candles.push({ timestamp, open, high, low, close, volume });
  }

  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Data Quality Gate ─────────────────────────────────────

/**
 * Verifica a qualidade dos dados retornados.
 * Conforme especificação:
 * - Mercado fechado → NO_TRADE (não erro)
 * - Dados atrasados → DEGRADED
 * - Sem dados → DOWN
 */
function evaluateDataQuality(
  candles: readonly RawOhlcCandle[],
  timeframe: MarketTimeframe,
  symbol: string
): DataQualityResult {
  const now = Date.now() / 1000; // Unix seconds
  const nowDate = new Date();
  const dayOfWeek = nowDate.getUTCDay(); // 0=Sunday, 6=Saturday

  // Verificar mercado fechado (fim de semana)
  // FOREX fecha sexta ~21:00 UTC e abre domingo ~21:00 UTC
  const isWeekend =
    dayOfWeek === 0 && nowDate.getUTCHours() < 21 || // Domingo antes das 21h
    dayOfWeek === 6 || // Sábado
    dayOfWeek === 5 && nowDate.getUTCHours() >= 22; // Sexta após 22h

  if (isWeekend) {
    return {
      status: "MARKET_CLOSED",
      reason: `Mercado FOREX fechado (fim de semana) para ${symbol}`,
      gaps_detected: false,
      stale_data: false,
      market_closed: true,
      volume_missing: true,
    };
  }

  // Sem dados
  if (candles.length === 0) {
    return {
      status: "DOWN",
      reason: `Nenhum candle retornado para ${symbol} ${timeframe}`,
      gaps_detected: false,
      stale_data: false,
      market_closed: false,
      volume_missing: true,
    };
  }

  // Verificar dados atrasados (stale)
  const lastCandle = candles[candles.length - 1];
  const staleThresholds: Record<MarketTimeframe, number> = {
    M15: 30 * 60,    // 30 minutos
    H1: 120 * 60,    // 2 horas
    H4: 480 * 60,    // 8 horas
    D1: 48 * 3600,   // 48 horas
  };

  const staleThreshold = staleThresholds[timeframe];
  const isStale = (now - lastCandle.timestamp) > staleThreshold;

  // Verificar gaps (candles faltantes)
  let gapsDetected = false;
  if (candles.length >= 2) {
    const expectedIntervals: Record<MarketTimeframe, number> = {
      M15: 15 * 60,
      H1: 60 * 60,
      H4: 4 * 60 * 60,
      D1: 24 * 60 * 60,
    };
    const expectedInterval = expectedIntervals[timeframe];

    for (let i = 1; i < candles.length; i++) {
      const gap = candles[i].timestamp - candles[i - 1].timestamp;
      // Permitir até 3x o intervalo esperado (para cobrir weekends/holidays em D1)
      if (gap > expectedInterval * 3) {
        gapsDetected = true;
        break;
      }
    }
  }

  // Verificar volume missing
  const volumeMissing = candles.every((c) => c.volume === 0);

  if (isStale) {
    return {
      status: "DEGRADED",
      reason: `Dados atrasados para ${symbol} ${timeframe}: último candle há ${Math.round((now - lastCandle.timestamp) / 60)} minutos`,
      gaps_detected: gapsDetected,
      stale_data: true,
      market_closed: false,
      volume_missing: volumeMissing,
    };
  }

  return {
    status: "OK",
    reason: "Dados dentro dos parâmetros esperados",
    gaps_detected: gapsDetected,
    stale_data: false,
    market_closed: false,
    volume_missing: volumeMissing,
  };
}

// ─── Fetch Individual ──────────────────────────────────────

/** Máximo de retries */
const MAX_RETRIES = 2;

/**
 * Busca candles de um símbolo/timeframe específico do cTrader.
 *
 * @param internalSymbol - Símbolo interno (ex: "EURUSD")
 * @param timeframe - Timeframe desejado
 * @returns FetchResult com candles normalizados
 */
async function fetchTimeframe(
  internalSymbol: string,
  timeframe: MarketTimeframe
): Promise<FetchResult> {
  const symbolInfo = await resolveSymbolId(internalSymbol);
  if (!symbolInfo) {
    throw new Error(`[cTrader] Não foi possível resolver symbolId para ${internalSymbol}`);
  }

  const { symbolId, digits } = symbolInfo;
  const period = TIMEFRAME_TO_CTRADER_PERIOD[timeframe];

  // Calcular range de tempo
  // cTrader tem limites de range por período:
  // M15: máx ~1 semana, H1: máx ~1 mês, H4: máx ~3 meses, D1: máx ~1 ano
  const now = Date.now();
  const rangeMs: Record<MarketTimeframe, number> = {
    M15: 5 * 24 * 3600 * 1000,     // 5 dias
    H1: 7 * 24 * 3600 * 1000,      // 7 dias
    H4: 30 * 24 * 3600 * 1000,     // 30 dias
    D1: 60 * 24 * 3600 * 1000,     // 60 dias
  };

  const fromTimestamp = now - rangeMs[timeframe];
  const toTimestamp = now;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * attempt); // Backoff: 1s, 2s
    }

    try {
      await ensureConnected();

      const res = await sendAndWait(
        PAYLOAD.PROTO_OA_GET_TRENDBARS_REQ,
        {
          ctidTraderAccountId: _config!.accountId,
          fromTimestamp,
          toTimestamp,
          period,
          symbolId,
        },
        _config!.timeoutMs + 5000 // Extra buffer para requests históricas
      ) as {
        payloadType: number;
        payload: {
          trendbar?: Array<{
            low?: number;
            deltaOpen?: number;
            deltaClose?: number;
            deltaHigh?: number;
            volume?: number;
            utcTimestampInMinutes?: number;
          }>;
        };
      };

      if (res.payloadType !== PAYLOAD.PROTO_OA_GET_TRENDBARS_RES) {
        throw new Error(`[cTrader] Resposta inesperada: payloadType=${res.payloadType}`);
      }

      const trendbars = res.payload?.trendbar ?? [];
      const candles = convertTrendbars(trendbars, digits);

      return {
        symbol: internalSymbol,
        timeframe,
        candles,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[cTrader] Tentativa ${attempt + 1}/${MAX_RETRIES + 1} falhou para ${internalSymbol} ${timeframe}: ${lastError.message}`
      );

      // Se erro de autenticação, reconectar
      if (lastError.message.includes("AUTH") || lastError.message.includes("Token")) {
        _authenticated = false;
        try {
          await connect();
        } catch {
          // Será tentado no próximo retry
        }
      }
    }
  }

  throw new Error(
    `[cTrader] Falha ao buscar ${internalSymbol} ${timeframe} após ${MAX_RETRIES + 1} tentativas: ${lastError?.message}`
  );
}

// ─── Fetch Completo ────────────────────────────────────────

/**
 * Busca todos os timeframes necessários para um símbolo.
 * Retorna um MarketDataSnapshot completo.
 *
 * Respeita rate limit de 5 req/s para dados históricos.
 * Executa requests sequencialmente com pequeno delay.
 *
 * @param symbol - Símbolo interno (ex: "EURUSD")
 * @returns MarketDataSnapshot com candles de todos os timeframes
 */
export async function fetchMarketData(
  symbol: string
): Promise<MarketDataSnapshot> {
  // Buscar sequencialmente para respeitar rate limits cTrader
  // (5 requests/segundo para dados históricos)
  const m15Result = await fetchTimeframe(symbol, "M15");
  await sleep(250); // ~4 req/s para margem de segurança

  const h1Result = await fetchTimeframe(symbol, "H1");
  await sleep(250);

  const h4Result = await fetchTimeframe(symbol, "H4");
  await sleep(250);

  const d1Result = await fetchTimeframe(symbol, "D1");

  return {
    symbol,
    fetchedAt: new Date().toISOString(),
    D1: d1Result.candles,
    H4: h4Result.candles,
    H1: h1Result.candles,
    M15: m15Result.candles,
  };
}

/**
 * Busca dados de mercado para múltiplos símbolos.
 * Executa sequencialmente para respeitar rate limits.
 *
 * @param symbols - Lista de símbolos internos
 * @returns Map de símbolo → MarketDataSnapshot
 */
export async function fetchMultipleMarketData(
  symbols: readonly string[]
): Promise<Map<string, MarketDataSnapshot>> {
  const results = new Map<string, MarketDataSnapshot>();

  // Conectar uma vez antes de buscar todos os símbolos
  await ensureConnected();

  for (const symbol of symbols) {
    try {
      const snapshot = await fetchMarketData(symbol);

      // Data Quality Gate
      const m15Quality = evaluateDataQuality(snapshot.M15, "M15", symbol);
      const h1Quality = evaluateDataQuality(snapshot.H1, "H1", symbol);

      if (m15Quality.status === "DOWN" && h1Quality.status === "DOWN") {
        console.error(`[cTrader] Data Quality DOWN para ${symbol} — ignorando`);
        continue;
      }

      if (m15Quality.status === "MARKET_CLOSED") {
        console.warn(`[cTrader] Mercado fechado para ${symbol} — NO_TRADE`);
        // Ainda retorna os dados (últimos disponíveis) para que o MCL
        // possa decidir NO_TRADE com reason
        results.set(symbol, snapshot);
        continue;
      }

      if (m15Quality.status === "DEGRADED" || h1Quality.status === "DEGRADED") {
        console.warn(`[cTrader] Data Quality DEGRADED para ${symbol}: ${m15Quality.reason}`);
      }

      results.set(symbol, snapshot);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[cTrader] Erro ao buscar ${symbol}: ${err.message}`);
      // Não quebra o tick — continua com os outros símbolos
    }

    // Delay entre símbolos para rate limiting
    await sleep(500);
  }

  return results;
}

// ─── Cleanup ───────────────────────────────────────────────

/**
 * Encerra a conexão WebSocket com o cTrader.
 * Deve ser chamado ao encerrar a aplicação.
 */
export async function closeCTraderConnection(): Promise<void> {
  await disconnect();
  _symbolCache.clear();
  console.log("[cTrader] Conexão encerrada");
}

/**
 * Retorna o estado atual da qualidade dos dados para um símbolo.
 */
export { evaluateDataQuality };

// ─── Exports auxiliares ────────────────────────────────────

export { unixToISO };
