import { z } from "zod";
import { CorrelationIdSchema, EventIdSchema } from "../base/ids";
import { TimestampSchema } from "../base/time";
import { SeveritySchema } from "../base/severity";
import { ReasonCodeSchema } from "../enums/reason-codes";

// ─────────────────────────────────────────────────────────────
// PM Decision
// Decisão do Portfolio Manager sobre um Brain Intent
// ─────────────────────────────────────────────────────────────

/**
 * Tipo de decisão do PM.
 */
export const PmDecisionTypeEnum = z.enum([
  "ALLOW",
  "DENY",
  "QUEUE",
  "MODIFY",
]);

/**
 * Bloco "why" — justificativa estruturada.
 */
export const PmWhyBlockSchema = z.object({
  reason_code: ReasonCodeSchema,
  message: z.string().min(1).describe("Mensagem humana explicando a decisão"),
});

/**
 * Ajustes de risco aplicados pelo PM.
 */
export const RiskAdjustmentsSchema = z.object({
  original_risk_pct: z.number().positive().max(100).describe("Risco original proposto pelo brain"),
  adjusted_risk_pct: z.number().nonnegative().max(100).describe("Risco ajustado pelo PM"),
  adjustment_reason: z.string().min(1).describe("Motivo do ajuste de risco"),
}).nullable().describe("Ajustes de risco (null se não houve ajuste)");

/**
 * Estado de risco no momento da decisão.
 */
export const RiskStateSchema = z.object({
  current_drawdown_pct: z.number().describe("Drawdown atual em percentual"),
  current_exposure_pct: z.number().nonnegative().describe("Exposição atual em percentual"),
  open_positions: z.number().int().nonnegative().describe("Número de posições abertas"),
  daily_loss_pct: z.number().describe("Perda diária acumulada em percentual"),
  available_risk_pct: z.number().describe("Risco disponível em percentual"),
});

/**
 * Schema principal: PM Decision.
 */
export const PmDecisionSchema = z.object({
  event_id: EventIdSchema,
  correlation_id: CorrelationIdSchema,
  timestamp: TimestampSchema,
  severity: SeveritySchema,
  intent_event_id: EventIdSchema.describe("event_id do intent original"),
  decision: PmDecisionTypeEnum,
  risk_adjustments: RiskAdjustmentsSchema,
  risk_state: RiskStateSchema,
  why: PmWhyBlockSchema,
});
