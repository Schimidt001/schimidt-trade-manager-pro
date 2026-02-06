import { z } from "zod";
import { CorrelationIdSchema, EventIdSchema } from "../base/ids";
import { TimestampSchema } from "../base/time";
import { SeveritySchema } from "../base/severity";
import { BrainIdSchema } from "../enums/brains";
import { ReasonCodeSchema } from "../enums/reason-codes";

// ─────────────────────────────────────────────────────────────
// EHM Action
// Ação emitida pelo Emergency & Health Manager
// ─────────────────────────────────────────────────────────────

/**
 * Tipo de ação do EHM.
 */
export const EhmActionTypeEnum = z.enum([
  "REDUCE_RISK",
  "EXIT_NOW",
  "COOLDOWN",
]);

/**
 * Escopo do cooldown.
 */
export const CooldownScopeEnum = z.enum([
  "BRAIN",
  "SYMBOL",
  "GLOBAL",
]);

/**
 * Bloco de cooldown — escopo + until.
 */
export const CooldownBlockSchema = z.object({
  scope: CooldownScopeEnum,
  target: z.string().min(1).describe("Alvo do cooldown (brain_id, símbolo ou 'ALL')"),
  until: TimestampSchema.describe("Fim do período de cooldown"),
}).nullable().describe("Cooldown (null se ação não é COOLDOWN)");

/**
 * Bloco "why" — justificativa estruturada.
 */
export const EhmWhyBlockSchema = z.object({
  reason_code: ReasonCodeSchema,
  message: z.string().min(1).describe("Mensagem humana explicando a ação de emergência"),
});

/**
 * Schema principal: EHM Action.
 */
export const EhmActionSchema = z.object({
  event_id: EventIdSchema,
  correlation_id: CorrelationIdSchema,
  timestamp: TimestampSchema,
  severity: SeveritySchema,
  action: EhmActionTypeEnum,
  affected_brains: z.array(BrainIdSchema).describe("Brains afetados pela ação"),
  affected_symbols: z.array(z.string().min(1)).describe("Símbolos afetados pela ação"),
  cooldown: CooldownBlockSchema,
  why: EhmWhyBlockSchema,
});
