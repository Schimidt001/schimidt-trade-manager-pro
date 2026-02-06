// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Correlation & ID Utilities
// ═══════════════════════════════════════════════════════════════

import { v4 as uuidv4 } from "uuid";

/**
 * Gera um novo UUID v4 para event_id.
 */
export function newEventId(): string {
  return uuidv4();
}

/**
 * Gera um novo UUID v4 para correlation_id.
 */
export function newCorrelationId(): string {
  return uuidv4();
}

/**
 * Retorna timestamp ISO 8601 atual (UTC).
 */
export function nowISO(): string {
  return new Date().toISOString();
}
