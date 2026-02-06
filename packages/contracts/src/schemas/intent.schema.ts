import { z } from "zod";
import { CorrelationIdSchema, EventIdSchema } from "../base/ids";
import { TimestampSchema } from "../base/time";
import { SeveritySchema } from "../base/severity";
import { BrainIdSchema } from "../enums/brains";
import { ReasonCodeSchema } from "../enums/reason-codes";

// ─────────────────────────────────────────────────────────────
// Brain Intent
// Intenção emitida por um brain para o Portfolio Manager
// ─────────────────────────────────────────────────────────────

/**
 * Tipo de intent.
 */
export const IntentTypeEnum = z.enum([
  "OPEN_LONG",
  "OPEN_SHORT",
  "CLOSE",
  "SCALE_IN",
  "SCALE_OUT",
  "HEDGE",
]);

/**
 * Bloco "why" — justificativa estruturada.
 */
export const IntentWhyBlockSchema = z.object({
  reason_code: ReasonCodeSchema,
  message: z.string().min(1).describe("Mensagem humana explicando a intenção"),
});

/**
 * Plano de trade proposto (sem lógica de execução).
 */
export const TradePlanSchema = z.object({
  entry_price: z.number().positive().describe("Preço de entrada proposto"),
  stop_loss: z.number().positive().describe("Stop loss proposto"),
  take_profit: z.number().positive().describe("Take profit proposto"),
  timeframe: z.string().min(1).describe("Timeframe de referência (ex: 1H, 4H, D1)"),
});

/**
 * Constraints operacionais.
 */
export const IntentConstraintsSchema = z.object({
  max_slippage_bps: z.number().nonnegative().describe("Slippage máximo aceito em basis points"),
  valid_until: TimestampSchema.describe("Validade máxima do intent"),
  min_rr_ratio: z.number().positive().describe("Ratio risco/retorno mínimo exigido"),
});

/**
 * Schema principal: Brain Intent.
 */
export const BrainIntentSchema = z.object({
  event_id: EventIdSchema,
  correlation_id: CorrelationIdSchema,
  timestamp: TimestampSchema,
  severity: SeveritySchema,
  brain_id: BrainIdSchema,
  symbol: z.string().min(1).describe("Símbolo do ativo"),
  intent_type: IntentTypeEnum,
  proposed_risk_pct: z.number().positive().max(100).describe("Risco proposto em percentual do capital"),
  trade_plan: TradePlanSchema,
  constraints: IntentConstraintsSchema,
  why: IntentWhyBlockSchema,
});
