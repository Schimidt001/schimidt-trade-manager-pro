import { z } from "zod";
import { CorrelationIdSchema, EventIdSchema } from "../base/ids";
import { TimestampSchema } from "../base/time";
import { SeveritySchema } from "../base/severity";
import { ReasonCodeSchema } from "../enums/reason-codes";

// ─────────────────────────────────────────────────────────────
// Provider State Change
// Mudança de estado de um provider externo
// ─────────────────────────────────────────────────────────────

/**
 * Estado do provider.
 */
export const ProviderHealthEnum = z.enum([
  "CONNECTED",
  "DISCONNECTED",
  "DEGRADED",
  "RATE_LIMITED",
  "MAINTENANCE",
  "AUTH_FAILURE",
]);

/**
 * Bloco "why" — justificativa estruturada.
 */
export const ProvWhyBlockSchema = z.object({
  reason_code: ReasonCodeSchema,
  message: z.string().min(1).describe("Mensagem humana explicando a mudança de estado do provider"),
});

/**
 * Schema principal: Provider State Change.
 */
export const ProviderStateChangeSchema = z.object({
  event_id: EventIdSchema,
  correlation_id: CorrelationIdSchema,
  timestamp: TimestampSchema,
  severity: SeveritySchema,
  provider: z.string().min(1).describe("Nome do provider (ex: binance, mt5, bloomberg)"),
  previous_state: ProviderHealthEnum.describe("Estado anterior do provider"),
  new_state: ProviderHealthEnum.describe("Novo estado do provider"),
  why: ProvWhyBlockSchema,
});
