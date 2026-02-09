import { z } from "zod";
import { CorrelationIdSchema, EventIdSchema } from "../base/ids";
import { TimestampSchema } from "../base/time";
import { SeveritySchema } from "../base/severity";
import {
  MarketStructureSchema,
  VolatilityLevelSchema,
  LiquidityPhaseSchema,
  MarketSessionSchema,
  EventProximitySchema,
} from "../enums/states";
import { ExecutionHealthSchema } from "../enums/execution";
import { GlobalModeSchema } from "../enums/global-modes";
import { ReasonCodeSchema } from "../enums/reason-codes";

// ─────────────────────────────────────────────────────────────
// Market Context Snapshot (MCL)
// Snapshot completo do contexto de mercado emitido pelo MCL
// ─────────────────────────────────────────────────────────────

/**
 * Bloco "why" — justificativa estruturada obrigatória.
 */
export const WhyBlockSchema = z.object({
  reason_code: ReasonCodeSchema,
  message: z.string().min(1).describe("Mensagem humana explicando o motivo"),
});

/**
 * Estados de mercado observados.
 */
export const MarketStatesSchema = z.object({
  structure: MarketStructureSchema,
  volatility: VolatilityLevelSchema,
  liquidity_phase: LiquidityPhaseSchema,
  session: MarketSessionSchema,
  event_proximity: EventProximitySchema,
});

/**
 * Métricas de mercado.
 */
export const MarketMetricsSchema = z.object({
  atr: z.number().nonnegative().describe("Average True Range"),
  spread_bps: z.number().nonnegative().describe("Spread em basis points"),
  volume_ratio: z.number().nonnegative().describe("Ratio de volume vs média"),
  correlation_index: z.number().min(-1).max(1).describe("Índice de correlação entre ativos"),
  last_close: z.number().positive().describe("Preço de fechamento do último candle H1"),
});

/**
 * Schema principal: Market Context Snapshot.
 */
export const MclSnapshotSchema = z.object({
  event_id: EventIdSchema,
  correlation_id: CorrelationIdSchema,
  timestamp: TimestampSchema,
  severity: SeveritySchema,
  symbol: z.string().min(1).describe("Símbolo do ativo (ex: EURUSD, BTCUSD)"),
  global_mode: GlobalModeSchema,
  market_states: MarketStatesSchema,
  metrics: MarketMetricsSchema,
  execution_state: ExecutionHealthSchema,
  why: WhyBlockSchema,
});
