import { z } from "zod";
import { CorrelationIdSchema, EventIdSchema } from "../base/ids";
import { TimestampSchema } from "../base/time";
import { SeveritySchema } from "../base/severity";
import { ReasonCodeSchema } from "../enums/reason-codes";

// ─────────────────────────────────────────────────────────────
// Audit Log
// Registro de auditoria para mudanças de configuração e ações manuais
// ─────────────────────────────────────────────────────────────

/**
 * Ator que executou a ação.
 */
export const AuditActorSchema = z.object({
  user: z.string().min(1).describe("Identificador do usuário (email, ID ou sistema)"),
  role: z.string().min(1).describe("Papel do ator (ex: admin, operator, system)"),
});

/**
 * Tipo de ação de auditoria.
 */
export const AuditActionEnum = z.enum([
  "CONFIG_CHANGE",
  "PARAM_UPDATE",
  "BRAIN_TOGGLE",
  "MODE_OVERRIDE",
  "MANUAL_ACTION",
  "SYSTEM_RESTART",
  "PERMISSION_CHANGE",
]);

/**
 * Diff before/after.
 */
export const AuditDiffSchema = z.object({
  before: z.unknown().describe("Estado anterior do recurso (JSON arbitrário)"),
  after: z.unknown().describe("Estado posterior do recurso (JSON arbitrário)"),
});

/**
 * Schema principal: Audit Log.
 */
export const AuditLogSchema = z.object({
  event_id: EventIdSchema,
  correlation_id: CorrelationIdSchema,
  timestamp: TimestampSchema,
  severity: SeveritySchema,
  actor: AuditActorSchema,
  action: AuditActionEnum,
  resource: z.string().min(1).describe("Recurso afetado (ex: brain.A2, config.risk_limits)"),
  diff: AuditDiffSchema,
  reason: z.string().min(1).describe("Motivo humano para a ação"),
  reason_code: ReasonCodeSchema,
});
