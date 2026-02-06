import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Timestamp base — ISO 8601 com suporte a UTC-3
// Usado em TODOS os schemas como marcação temporal canônica
// ─────────────────────────────────────────────────────────────

/**
 * ISO 8601 — aceita:
 *   2025-01-15T10:30:00Z           (UTC)
 *   2025-01-15T10:30:00.123Z       (UTC com milissegundos)
 *   2025-01-15T07:30:00-03:00      (UTC-3)
 *   2025-01-15T10:30:00+00:00      (offset explícito)
 */
const ISO_8601_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Schema Zod para timestamp ISO 8601.
 * Aceita UTC e offsets (incluindo UTC-3).
 */
export const TimestampSchema = z
  .string()
  .regex(ISO_8601_REGEX, "timestamp deve estar em formato ISO 8601 válido (ex: 2025-01-15T10:30:00Z ou 2025-01-15T07:30:00-03:00)")
  .describe("Timestamp ISO 8601 (aceita UTC e UTC-3)");

// ─── Type inferido ───────────────────────────────────────────
export type Timestamp = z.infer<typeof TimestampSchema>;
