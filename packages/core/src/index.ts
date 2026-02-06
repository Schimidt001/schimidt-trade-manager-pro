// ═════════════════════════════════════════════════════════════
// @schimidt-brain/core — Core Decisional
// Ponto de entrada único do pacote.
//
// Exporta funções puras e determinísticas:
// - MCL: computeMarketContext
// - Brains: A2, B3, C3, D2 (geradores de intent)
// - PM: evaluateIntent (Portfolio Manager)
// - EHM: evaluateEdgeHealth (Edge Health Monitor)
//
// Nenhuma dependência de I/O, DB, HTTP, Redis.
// Todos os outputs são compatíveis com @schimidt-brain/contracts.
// ═════════════════════════════════════════════════════════════

// ─── MCL ─────────────────────────────────────────────────────
export { computeMarketContext } from "./mcl/computeMarketContext";

// ─── Brains ──────────────────────────────────────────────────
export {
  generateA2Intent,
  generateB3Intent,
  generateC3Intent,
  generateD2Intent,
  BRAIN_REGISTRY,
} from "./brains/index";

export type { IntentGenerator } from "./brains/index";

// ─── Portfolio Manager ───────────────────────────────────────
export { evaluateIntent } from "./pm/portfolioManager";
export { checkExposure } from "./pm/exposureGovernor";
export { checkHandoff, isHandoff } from "./pm/handoff";

// ─── Edge Health Monitor ─────────────────────────────────────
export { evaluateEdgeHealth } from "./ehm/edgeHealthMonitor";

// ─── Types (Input) ───────────────────────────────────────────
export type {
  OhlcBar,
  OhlcSet,
  PrecomputedMetrics,
  ExecutionContext,
  MclInput,
  BrainInput,
  RiskLimits,
  OpenPosition,
  PortfolioState,
  CooldownEntry,
  PmInput,
  PositionResult,
  ActivePositionState,
  EhmInput,
} from "./types/inputs";

// ─── Types (Output) — re-exports de contracts ────────────────
export type {
  MclSnapshot,
  WhyBlock,
  MarketStates,
  MarketMetrics,
  BrainIntent,
  IntentType,
  PmDecision,
  PmDecisionType,
  RiskAdjustments,
  RiskState,
  EhmAction,
  EhmActionType,
  CooldownBlock,
} from "./types/outputs";
