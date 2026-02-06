import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// IDs base — UUID v4 canônico
// Usados em TODOS os schemas como identificadores de correlação e evento
// ─────────────────────────────────────────────────────────────

/**
 * UUID v4 — formato canônico: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Schema Zod para correlation_id (UUID v4).
 * Identifica de forma única uma cadeia de eventos correlacionados.
 */
export const CorrelationIdSchema = z
  .string()
  .regex(UUID_REGEX, "correlation_id deve ser um UUID v4 válido")
  .describe("Identificador de correlação (UUID v4)");

/**
 * Schema Zod para event_id (UUID v4).
 * Identifica de forma única um evento individual.
 */
export const EventIdSchema = z
  .string()
  .regex(UUID_REGEX, "event_id deve ser um UUID v4 válido")
  .describe("Identificador único do evento (UUID v4)");

// ─── Types inferidos ─────────────────────────────────────────
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;
