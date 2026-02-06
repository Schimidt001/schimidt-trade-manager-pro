// ═════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Provider Health
// Avaliação de saúde do provider de calendário econômico
//
// Regras institucionais:
// - DOWN: fetch falha ou retorna vazio em dia útil repetidamente
// - DEGRADED: campos essenciais faltando, volume inconsistente
// - OK: dados completos e confiáveis
//
// Se provider != OK → emitir PROVIDER_STATE_CHANGE
// Se DEGRADED → reason EVENT_DATA_DEGRADED_D2_OFF (D2 não opera "às cegas")
// ═════════════════════════════════════════════════════════════

import { ReasonCode } from "@schimidt-brain/contracts";
import type { EconomicEventNormalized, ProviderHealthResult } from "./types";

// ─── Constantes ─────────────────────────────────────────────

/**
 * Campos essenciais que todo evento deve ter para ser considerado completo.
 * Se uma proporção significativa de eventos não tiver esses campos,
 * o provider é considerado DEGRADED.
 */
const ESSENTIAL_FIELDS: (keyof EconomicEventNormalized)[] = [
  "timestamp",
  "currency",
  "title",
  "impact",
];

/**
 * Campos desejáveis (previous/forecast). Se muitos eventos
 * não tiverem esses campos, pode indicar degradação.
 */
const DESIRABLE_FIELDS: (keyof EconomicEventNormalized)[] = [
  "previous",
  "forecast",
];

/**
 * Limiar de eventos com campos essenciais faltando para considerar DEGRADED.
 * Se mais de 30% dos eventos tiverem campos essenciais faltando → DEGRADED.
 */
const ESSENTIAL_MISSING_THRESHOLD = 0.3;

/**
 * Limiar de eventos HIGH impact sem previous/forecast para considerar DEGRADED.
 * Se mais de 50% dos eventos HIGH não tiverem previous ou forecast → DEGRADED.
 */
const HIGH_IMPACT_INCOMPLETE_THRESHOLD = 0.5;

/**
 * Volume mínimo esperado de eventos em um dia útil.
 * Se retornar menos que isso, pode indicar problema.
 */
const MIN_EXPECTED_EVENTS_WEEKDAY = 3;

/**
 * Volume máximo razoável de eventos em um dia.
 * Se retornar mais que isso, pode indicar dados duplicados/corrompidos.
 */
const MAX_REASONABLE_EVENTS = 500;

// ─── Helpers ────────────────────────────────────────────────

/**
 * Verifica se uma data é dia útil (segunda a sexta).
 */
function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

/**
 * Verifica se um campo essencial está presente e não vazio.
 */
function isFieldPresent(
  event: EconomicEventNormalized,
  field: keyof EconomicEventNormalized,
): boolean {
  const value = event[field];
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim().length === 0) return false;
  return true;
}

// ─── Avaliação Principal ────────────────────────────────────

/**
 * Avalia a saúde do provider com base nos eventos retornados.
 *
 * Critérios de avaliação:
 *
 * **DOWN**:
 * - Eventos é null/undefined (fetch falhou)
 * - Array vazio em dia útil (dados esperados não chegaram)
 *
 * **DEGRADED**:
 * - Mais de 30% dos eventos sem campos essenciais
 * - Mais de 50% dos eventos HIGH impact sem previous/forecast
 * - Volume absurdamente alto (possível corrupção/duplicação)
 * - Todos os eventos com currency "UNKNOWN"
 *
 * **OK**:
 * - Dados completos e dentro dos parâmetros esperados
 *
 * @param events - Array de eventos normalizados (null se fetch falhou)
 * @param fetchDate - Data do fetch (para verificar dia útil)
 * @param fetchError - Erro do fetch (se houver)
 * @returns Resultado da avaliação com state, reason_code e reason
 */
export function evaluateProviderHealth(
  events: EconomicEventNormalized[] | null,
  fetchDate?: Date,
  fetchError?: Error,
): ProviderHealthResult {
  // ─── DOWN: fetch falhou completamente ─────────────────────
  if (fetchError) {
    const isTimeout =
      fetchError.message.includes("Timeout") ||
      fetchError.message.includes("AbortError");

    return {
      state: "DOWN",
      reason_code: isTimeout
        ? ReasonCode.PROV_DISCONNECTED
        : ReasonCode.PROV_DATA_ERROR,
      reason: `Provider DOWN: ${fetchError.message}`,
    };
  }

  // ─── DOWN: sem dados ──────────────────────────────────────
  if (!events) {
    return {
      state: "DOWN",
      reason_code: ReasonCode.PROV_DISCONNECTED,
      reason: "Provider DOWN: nenhum dado retornado (null)",
    };
  }

  // ─── DOWN: array vazio em dia útil ────────────────────────
  if (events.length === 0) {
    const checkDate = fetchDate ?? new Date();
    if (isWeekday(checkDate)) {
      return {
        state: "DOWN",
        reason_code: ReasonCode.PROV_DATA_ERROR,
        reason:
          "Provider DOWN: nenhum evento retornado em dia útil — possível falha no feed",
      };
    }
    // Fim de semana com zero eventos é aceitável
    return {
      state: "OK",
      reason_code: ReasonCode.PROV_STATE_CHANGE,
      reason: "Provider OK: sem eventos (fim de semana/feriado)",
    };
  }

  // ─── Verificar volume absurdo ─────────────────────────────
  if (events.length > MAX_REASONABLE_EVENTS) {
    return {
      state: "DEGRADED",
      reason_code: ReasonCode.PROV_DATA_ERROR,
      reason: `Provider DEGRADED: volume anormal de eventos (${events.length} > ${MAX_REASONABLE_EVENTS}) — possível duplicação`,
    };
  }

  // ─── Verificar campos essenciais ──────────────────────────
  let essentialMissingCount = 0;
  for (const event of events) {
    const hasMissing = ESSENTIAL_FIELDS.some(
      (field) => !isFieldPresent(event, field),
    );
    if (hasMissing) {
      essentialMissingCount++;
    }
  }

  const essentialMissingRatio = essentialMissingCount / events.length;
  if (essentialMissingRatio > ESSENTIAL_MISSING_THRESHOLD) {
    return {
      state: "DEGRADED",
      reason_code: ReasonCode.PROV_DATA_ERROR,
      reason: `Provider DEGRADED: ${(essentialMissingRatio * 100).toFixed(0)}% dos eventos sem campos essenciais (timestamp/currency/title/impact)`,
    };
  }

  // ─── Verificar eventos HIGH impact sem previous/forecast ──
  const highImpactEvents = events.filter((e) => e.impact === "HIGH");
  if (highImpactEvents.length > 0) {
    let incompleteHighCount = 0;
    for (const event of highImpactEvents) {
      const hasDesirable = DESIRABLE_FIELDS.some((field) =>
        isFieldPresent(event, field),
      );
      if (!hasDesirable) {
        incompleteHighCount++;
      }
    }

    const incompleteHighRatio = incompleteHighCount / highImpactEvents.length;
    if (incompleteHighRatio > HIGH_IMPACT_INCOMPLETE_THRESHOLD) {
      return {
        state: "DEGRADED",
        reason_code: ReasonCode.PROV_DATA_ERROR,
        reason: `Provider DEGRADED: ${(incompleteHighRatio * 100).toFixed(0)}% dos eventos HIGH impact sem previous/forecast — D2 não deve operar`,
      };
    }
  }

  // ─── Verificar moedas desconhecidas ───────────────────────
  const unknownCurrencyCount = events.filter(
    (e) => e.currency === "UNKNOWN",
  ).length;
  const unknownRatio = unknownCurrencyCount / events.length;
  if (unknownRatio > 0.5) {
    return {
      state: "DEGRADED",
      reason_code: ReasonCode.PROV_DATA_ERROR,
      reason: `Provider DEGRADED: ${(unknownRatio * 100).toFixed(0)}% dos eventos com moeda desconhecida`,
    };
  }

  // ─── Verificar volume mínimo em dia útil ──────────────────
  const checkDate = fetchDate ?? new Date();
  if (isWeekday(checkDate) && events.length < MIN_EXPECTED_EVENTS_WEEKDAY) {
    return {
      state: "DEGRADED",
      reason_code: ReasonCode.PROV_DATA_ERROR,
      reason: `Provider DEGRADED: apenas ${events.length} eventos em dia útil (mínimo esperado: ${MIN_EXPECTED_EVENTS_WEEKDAY})`,
    };
  }

  // ─── OK: tudo dentro dos parâmetros ───────────────────────
  return {
    state: "OK",
    reason_code: ReasonCode.PROV_STATE_CHANGE,
    reason: `Provider OK: ${events.length} eventos carregados com sucesso`,
  };
}

/**
 * Determina se o D2 deve ser desligado com base no estado do provider.
 *
 * Regra institucional: se provider != OK, D2 não pode operar "às cegas".
 *
 * @param state - Estado atual do provider
 * @returns true se D2 deve ser desligado
 */
export function shouldDisableD2(state: "OK" | "DEGRADED" | "DOWN"): boolean {
  return state !== "OK";
}
