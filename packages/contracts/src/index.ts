// ═════════════════════════════════════════════════════════════
// @schimidt-brain/contracts — FONTE ÚNICA DA VERDADE
// ═════════════════════════════════════════════════════════════
// Este arquivo é o ponto de entrada único do pacote.
// Todos os outros pacotes do Schimidt Brain importam daqui.
// Nenhum formato pode ser definido fora deste pacote.
// ═════════════════════════════════════════════════════════════

// ─── Base Types ──────────────────────────────────────────────
export {
  CorrelationIdSchema,
  EventIdSchema,
  type CorrelationId,
  type EventId,
} from "./base/ids";

export {
  TimestampSchema,
  type Timestamp,
} from "./base/time";

export {
  Severity,
  SeveritySchema,
  type SeverityType,
} from "./base/severity";

// ─── Enums Canônicos ─────────────────────────────────────────
export {
  BrainId,
  BrainIdSchema,
  type BrainIdType,
} from "./enums/brains";

export {
  MarketStructure,
  MarketStructureSchema,
  VolatilityLevel,
  VolatilityLevelSchema,
  LiquidityPhase,
  LiquidityPhaseSchema,
  MarketSession,
  MarketSessionSchema,
  EventProximity,
  EventProximitySchema,
  type MarketStructureType,
  type VolatilityLevelType,
  type LiquidityPhaseType,
  type MarketSessionType,
  type EventProximityType,
} from "./enums/states";

export {
  ExecutionHealth,
  ExecutionHealthSchema,
  type ExecutionHealthType,
} from "./enums/execution";

export {
  GlobalMode,
  GlobalModeSchema,
  type GlobalModeType,
} from "./enums/global-modes";

export {
  ReasonCode,
  ReasonCodeSchema,
  REASON_CODE_CATALOG,
  type ReasonCodeType,
} from "./enums/reason-codes";

// ─── Schemas (Zod) ───────────────────────────────────────────
export {
  MclSnapshotSchema,
  WhyBlockSchema,
  MarketStatesSchema,
  MarketMetricsSchema,
} from "./schemas/mcl.schema";

export {
  BrainIntentSchema,
  IntentTypeEnum,
  IntentWhyBlockSchema,
  TradePlanSchema,
  IntentConstraintsSchema,
} from "./schemas/intent.schema";

export {
  PmDecisionSchema,
  PmDecisionTypeEnum,
  PmWhyBlockSchema,
  RiskAdjustmentsSchema,
  RiskStateSchema,
} from "./schemas/pm-decision.schema";

export {
  EhmActionSchema,
  EhmActionTypeEnum,
  CooldownScopeEnum,
  CooldownBlockSchema,
  EhmWhyBlockSchema,
} from "./schemas/ehm-action.schema";

export {
  ExecutionStateChangeSchema,
  ExecWhyBlockSchema,
} from "./schemas/execution-state.schema";

export {
  ProviderStateChangeSchema,
  ProviderHealthEnum,
  ProvWhyBlockSchema,
} from "./schemas/provider-state.schema";

export {
  AuditLogSchema,
  AuditActorSchema,
  AuditActionEnum,
  AuditDiffSchema,
} from "./schemas/audit-log.schema";

// ─── Types (inferidos dos schemas) ───────────────────────────
export type {
  MclSnapshot,
  WhyBlock,
  MarketStates,
  MarketMetrics,
} from "./types/mcl";

export type {
  BrainIntent,
  IntentType,
  IntentWhyBlock,
  TradePlan,
  IntentConstraints,
} from "./types/intent";

export type {
  PmDecision,
  PmDecisionType,
  PmWhyBlock,
  RiskAdjustments,
  RiskState,
} from "./types/pm-decision";

export type {
  EhmAction,
  EhmActionType,
  CooldownScope,
  CooldownBlock,
  EhmWhyBlock,
} from "./types/ehm-action";

export type {
  ExecutionStateChange,
  ExecWhyBlock,
  ProviderStateChange,
  ProviderHealth,
  ProvWhyBlock,
  AuditLog,
  AuditActor,
  AuditAction,
  AuditDiff,
} from "./types/logs";
