// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Calendar Service
// Interface principal consumida pela API (Agente 4)
//
// Responsabilidades:
// - getDayCalendar: Trading Economics como provider primário (REAL, free tier com guest:guest)
// - getNextHighImpactEvent: próximo evento HIGH impact
// - computeEventWindows: janelas no-trade para eventos HIGH
//
// Regras institucionais:
// - Provider primário: Trading Economics (guest:guest ou TE_API_KEY)
// - Se TE falhar → provider DOWN (sem fallback para scraping)
// - Se provider != OK → emitir PROVIDER_STATE_CHANGE
// - Nunca voltar para mock
// - Sem dados = sem operar (política institucional)
// ═════════════════════════════════════════════════════════════

import { ReasonCode } from "@schimidt-brain/contracts";
import type {
  EconomicEventNormalized,
  EventWindow,
  CalendarServiceResponse,
  DataSource,
} from "./types";
import { fetchCalendarDay as fetchTe, healthCheck as teHealthCheck } from "./tradingEconomics";
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
 * Obtém o calendário econômico do dia usando Trading Economics como provider primário.
 *
 * Fluxo:
 * 1. Tenta Trading Economics (guest:guest ou TE_API_KEY) — provider primário
 * 2. Se TE falhar → retorna provider DOWN (sem fallback para scraping)
 * 3. Avalia saúde do provider usado
 * 4. Retorna eventos + estado do provider
 *
 * Política institucional:
 * - Sem dados = sem operar
 * - Nunca voltar para mock
 * - Degradação elegante: DEGRADED/DOWN bem reportado
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

  let events: EconomicEventNormalized[] | null = null;
  const providerUsed: DataSource = "TE";
  let teError: Error | null = null;

  // ─── Tentativa: Trading Economics (provider primário) ─────
  try {
    events = await fetchTe(targetDate, teApiKey);
  } catch (error: unknown) {
    teError = error instanceof Error ? error : new Error(String(error));
    events = null;
  }

  // ─── TE falhou → DOWN (sem fallback) ──────────────────────
  if (events === null) {
    return {
      events: [],
      provider_state: "DOWN",
      provider_used: providerUsed,
      reason_code: ReasonCode.PROV_DISCONNECTED,
      reason: `Trading Economics provider falhou: ${teError?.message ?? "Erro desconhecido"}`,
    };
  }

  // ─── Avaliar saúde do provider ────────────────────────────
  const health = evaluateProviderHealth(events, targetDate);

  const response: CalendarServiceResponse = {
    events,
    provider_state: health.state,
    provider_used: providerUsed,
  };

  if (health.state !== "OK") {
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

// ─── healthCheck ────────────────────────────────────────────

/**
 * Verifica se o provider Trading Economics está acessível.
 * Usado pela API para monitorar saúde do provider.
 *
 * @returns Status do provider
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  reason: string;
  message: string;
}> {
  const teApiKey = process.env.TRADING_ECONOMICS_API_KEY ?? "";
  return teHealthCheck(teApiKey);
}
