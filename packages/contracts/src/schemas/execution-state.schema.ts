import { z } from "zod";
import { CorrelationIdSchema, EventIdSchema } from "../base/ids";
import { TimestampSchema } from "../base/time";
import { SeveritySchema } from "../base/severity";
import { ExecutionHealthSchema } from "../enums/execution";
import { ReasonCodeSchema } from "../enums/reason-codes";

// ─────────────────────────────────────────────────────────────
// Execution State Change
// Mudança de estado na camada de execução
// ─────────────────────────────────────────────────────────────

/**
 * Bloco "why" — justificativa estruturada.
 */
export const ExecWhyBlockSchema = z.object({
  reason_code: ReasonCodeSchema,
  message: z.string().min(1).describe("Mensagem humana explicando a mudança de estado"),
});

/**
 * Schema principal: Execution State Change.
 */
export const ExecutionStateChangeSchema = z.object({
  event_id: EventIdSchema,
  correlation_id: CorrelationIdSchema,
  timestamp: TimestampSchema,
  severity: SeveritySchema,
  previous_state: ExecutionHealthSchema.describe("Estado anterior da execução"),
  new_state: ExecutionHealthSchema.describe("Novo estado da execução"),
  why: ExecWhyBlockSchema,
});
