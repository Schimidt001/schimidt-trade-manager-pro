// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Compute Market Metrics
// Calcula métricas derivadas a partir de candles OHLC reais.
//
// Responsabilidades:
// - ATR (Average True Range) sobre H1
// - Sessão de mercado (ASIA / LONDON / NY) por horário UTC
// - Spread proxy (tabela fixa por par + ajuste por volatilidade)
// - Volume ratio (proxy baseado em range relativo)
// - Correlation index (proxy baseado em direção inter-timeframe)
// - Session overlap (baseado em horário UTC)
// - Range expansion (ratio do range atual vs média)
//
// Regras:
// - Funções PURAS (sem I/O, sem Date.now())
// - Determinísticas dado o mesmo input
// - Não alteram dados de entrada
// ═════════════════════════════════════════════════════════════

import type { RawOhlcCandle, MarketDataSnapshot } from "./types";
import { TYPICAL_SPREADS_BPS, DEFAULT_SPREAD_BPS } from "./types";

// ─── Tipos de Resultado ─────────────────────────────────────

/**
 * Métricas calculadas a partir dos dados reais.
 * Compatível com PrecomputedMetrics do core.
 */
export interface ComputedMetrics {
  readonly atr: number;
  readonly spread_bps: number;
  readonly volume_ratio: number;
  readonly correlation_index: number;
  readonly session_overlap: number;
  readonly range_expansion: number;
}

/**
 * Sessão de mercado determinada por horário UTC.
 */
export type SessionName = "ASIA" | "LONDON" | "NY";

// ─── Constantes ─────────────────────────────────────────────

/** Período padrão para cálculo do ATR */
const ATR_PERIOD = 14;

/** Horários de sessão em UTC */
const SESSION_HOURS = {
  ASIA: { start: 0, end: 8 },      // 00:00 - 08:00 UTC
  LONDON: { start: 7, end: 16 },   // 07:00 - 16:00 UTC
  NY: { start: 12, end: 21 },      // 12:00 - 21:00 UTC
} as const;

// ─── ATR (Average True Range) ───────────────────────────────

/**
 * Calcula o True Range de um candle.
 * TR = max(H-L, |H-Cp|, |L-Cp|) onde Cp = close anterior.
 */
function trueRange(candle: RawOhlcCandle, previousClose: number): number {
  const hl = candle.high - candle.low;
  const hc = Math.abs(candle.high - previousClose);
  const lc = Math.abs(candle.low - previousClose);
  return Math.max(hl, hc, lc);
}

/**
 * Calcula o ATR (Average True Range) sobre candles H1.
 * Usa SMA simples sobre os últimos N candles.
 *
 * @param h1Candles - Candles H1 ordenados por timestamp
 * @param period - Período do ATR (default: 14)
 * @returns ATR em valor absoluto (não normalizado)
 */
export function computeATR(
  h1Candles: readonly RawOhlcCandle[],
  period: number = ATR_PERIOD
): number {
  if (h1Candles.length < 2) {
    // Fallback: range do único candle disponível
    return h1Candles.length === 1
      ? h1Candles[0].high - h1Candles[0].low
      : 0;
  }

  const trueRanges: number[] = [];
  for (let i = 1; i < h1Candles.length; i++) {
    trueRanges.push(trueRange(h1Candles[i], h1Candles[i - 1].close));
  }

  // Usar os últimos N true ranges (ou todos se menos que N)
  const usable = trueRanges.slice(-period);
  if (usable.length === 0) return 0;

  const sum = usable.reduce((acc, tr) => acc + tr, 0);
  return sum / usable.length;
}

// ─── Sessão de Mercado ──────────────────────────────────────

/**
 * Determina a sessão de mercado ativa com base no horário UTC.
 * Prioridade: NY > LONDON > ASIA (em caso de overlap).
 *
 * @param utcHour - Hora UTC (0-23)
 * @returns Sessão ativa
 */
export function determineSession(utcHour: number): SessionName {
  const inNY = utcHour >= SESSION_HOURS.NY.start && utcHour < SESSION_HOURS.NY.end;
  const inLondon = utcHour >= SESSION_HOURS.LONDON.start && utcHour < SESSION_HOURS.LONDON.end;
  const inAsia = utcHour >= SESSION_HOURS.ASIA.start && utcHour < SESSION_HOURS.ASIA.end;

  // Prioridade: se NY e London estão ambas ativas, NY tem prioridade
  if (inNY) return "NY";
  if (inLondon) return "LONDON";
  if (inAsia) return "ASIA";

  // Fora de todas as sessões (21-00 UTC) → ASIA (próxima a abrir)
  return "ASIA";
}

/**
 * Calcula o overlap de sessão.
 * Retorna um valor entre 0 e 1 indicando quanto da sessão atual
 * se sobrepõe com outra sessão.
 *
 * @param utcHour - Hora UTC atual
 * @returns Fator de overlap (0 = sem overlap, 1 = máximo overlap)
 */
export function computeSessionOverlap(utcHour: number): number {
  const inNY = utcHour >= SESSION_HOURS.NY.start && utcHour < SESSION_HOURS.NY.end;
  const inLondon = utcHour >= SESSION_HOURS.LONDON.start && utcHour < SESSION_HOURS.LONDON.end;
  const inAsia = utcHour >= SESSION_HOURS.ASIA.start && utcHour < SESSION_HOURS.ASIA.end;

  let activeSessions = 0;
  if (inNY) activeSessions++;
  if (inLondon) activeSessions++;
  if (inAsia) activeSessions++;

  if (activeSessions >= 2) return 0.8;
  if (activeSessions === 1) return 0.4;
  return 0.1; // Fora de sessão
}

// ─── Spread Proxy ───────────────────────────────────────────

/**
 * Calcula o spread proxy em basis points.
 * Usa tabela fixa por par + ajuste por volatilidade do candle.
 *
 * @param symbol - Símbolo interno (ex: "EURUSD")
 * @param m15Candles - Candles M15 recentes
 * @returns Spread estimado em basis points
 */
export function computeSpreadProxy(
  symbol: string,
  m15Candles: readonly RawOhlcCandle[]
): number {
  const baseSpread = TYPICAL_SPREADS_BPS[symbol] ?? DEFAULT_SPREAD_BPS;

  if (m15Candles.length === 0) return baseSpread;

  // Ajustar spread baseado na amplitude do último candle M15
  // Candles com range muito pequeno sugerem spread mais apertado
  // Candles com range muito grande sugerem spread mais largo
  const lastCandle = m15Candles[m15Candles.length - 1];
  const range = lastCandle.high - lastCandle.low;
  const midPrice = (lastCandle.high + lastCandle.low) / 2;

  if (midPrice <= 0) return baseSpread;

  const rangeBps = (range / midPrice) * 10000;

  // Se o range é muito pequeno (< 5 bps), spread pode estar mais apertado
  if (rangeBps < 5) return Math.max(baseSpread - 1, 1);

  // Se o range é muito grande (> 50 bps), spread provavelmente está mais largo
  if (rangeBps > 50) return baseSpread + 3;

  return baseSpread;
}

// ─── Volume Ratio (Proxy) ───────────────────────────────────

/**
 * Calcula o volume ratio como proxy baseado no range relativo.
 * Em FOREX, volume real não é disponível (OTC).
 * Usamos o range do candle como proxy de atividade.
 *
 * volume_ratio > 1.2 = atividade acima da média
 * volume_ratio < 0.8 = atividade abaixo da média
 *
 * @param h1Candles - Candles H1 ordenados por timestamp
 * @returns Volume ratio (proxy)
 */
export function computeVolumeRatio(
  h1Candles: readonly RawOhlcCandle[]
): number {
  if (h1Candles.length < 3) return 1.0;

  // Calcular range médio dos últimos N candles (excluindo o último)
  const historicalCandles = h1Candles.slice(-10, -1);
  if (historicalCandles.length === 0) return 1.0;

  const avgRange =
    historicalCandles.reduce((sum, c) => sum + (c.high - c.low), 0) /
    historicalCandles.length;

  if (avgRange <= 0) return 1.0;

  // Range do último candle vs média
  const lastCandle = h1Candles[h1Candles.length - 1];
  const lastRange = lastCandle.high - lastCandle.low;

  return lastRange / avgRange;
}

// ─── Correlation Index (Proxy) ──────────────────────────────

/**
 * Calcula o correlation index como proxy.
 * Mede a concordância direcional entre H1 e D1.
 *
 * correlation_index próximo de 1 = H1 e D1 na mesma direção
 * correlation_index próximo de 0 = H1 e D1 em direções opostas
 * correlation_index próximo de 0.5 = sem correlação clara
 *
 * @param h1Candles - Candles H1 recentes
 * @param d1Candles - Candles D1 recentes
 * @returns Correlation index (0 a 1)
 */
export function computeCorrelationIndex(
  h1Candles: readonly RawOhlcCandle[],
  d1Candles: readonly RawOhlcCandle[]
): number {
  if (h1Candles.length < 3 || d1Candles.length < 1) return 0.5;

  // Direção do D1 (último candle): 1 = bullish, -1 = bearish
  const lastD1 = d1Candles[d1Candles.length - 1];
  const d1Dir: number = lastD1.close >= lastD1.open ? 1 : -1;

  // Direção dos últimos 3 candles H1
  const recentH1 = h1Candles.slice(-3);
  let h1Score = 0;
  for (const candle of recentH1) {
    h1Score += candle.close >= candle.open ? 1 : -1;
  }
  const h1Dir: number = h1Score > 0 ? 1 : h1Score < 0 ? -1 : 0;

  // Se ambos na mesma direção → alta correlação
  if (d1Dir === h1Dir) return 0.75;

  // Se direções opostas → baixa correlação (divergência)
  if (d1Dir !== 0 && h1Dir !== 0 && d1Dir !== h1Dir) {
    return 0.15;
  }

  // Neutro (h1 sem direção clara)
  return 0.5;
}

// ─── Range Expansion ────────────────────────────────────────

/**
 * Calcula o fator de expansão de range.
 * Compara o range do último candle H1 com a média dos anteriores.
 *
 * range_expansion > 1.5 = expansão significativa (possível breakout)
 * range_expansion < 0.5 = compressão (possível buildup)
 *
 * @param h1Candles - Candles H1 ordenados por timestamp
 * @returns Fator de expansão de range
 */
export function computeRangeExpansion(
  h1Candles: readonly RawOhlcCandle[]
): number {
  if (h1Candles.length < 3) return 1.0;

  const historicalCandles = h1Candles.slice(-10, -1);
  if (historicalCandles.length === 0) return 1.0;

  const avgRange =
    historicalCandles.reduce((sum, c) => sum + (c.high - c.low), 0) /
    historicalCandles.length;

  if (avgRange <= 0) return 1.0;

  const lastCandle = h1Candles[h1Candles.length - 1];
  const lastRange = lastCandle.high - lastCandle.low;

  return lastRange / avgRange;
}

// ─── Compute All Metrics ────────────────────────────────────

/**
 * Calcula todas as métricas derivadas a partir de um MarketDataSnapshot.
 * Retorna ComputedMetrics compatível com PrecomputedMetrics do core.
 *
 * @param snapshot - Dados de mercado completos
 * @param timestampISO - Timestamp ISO 8601 do tick
 * @returns Métricas calculadas
 */
export function computeAllMetrics(
  snapshot: MarketDataSnapshot,
  timestampISO: string
): ComputedMetrics {
  const utcHour = new Date(timestampISO).getUTCHours();

  return {
    atr: computeATR(snapshot.H1),
    spread_bps: computeSpreadProxy(snapshot.symbol, snapshot.M15),
    volume_ratio: computeVolumeRatio(snapshot.H1),
    correlation_index: computeCorrelationIndex(snapshot.H1, snapshot.D1),
    session_overlap: computeSessionOverlap(utcHour),
    range_expansion: computeRangeExpansion(snapshot.H1),
  };
}

/**
 * Determina a sessão de mercado a partir de um timestamp ISO 8601.
 *
 * @param timestampISO - Timestamp ISO 8601
 * @returns Sessão ativa
 */
export function determineSessionFromTimestamp(timestampISO: string): SessionName {
  const utcHour = new Date(timestampISO).getUTCHours();
  return determineSession(utcHour);
}
