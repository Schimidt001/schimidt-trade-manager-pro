// ═════════════════════════════════════════════════════════════
// @schimidt-brain/core — Tipos de Output
// Re-exportações dos tipos de contracts usados como output.
// O core NUNCA define formatos próprios — usa contracts.
// ═════════════════════════════════════════════════════════════

export type {
  MclSnapshot,
  WhyBlock,
  MarketStates,
  MarketMetrics,
} from "@schimidt-brain/contracts";

export type {
  BrainIntent,
  IntentType,
  IntentWhyBlock,
  TradePlan,
  IntentConstraints,
} from "@schimidt-brain/contracts";

export type {
  PmDecision,
  PmDecisionType,
  PmWhyBlock,
  RiskAdjustments,
  RiskState,
} from "@schimidt-brain/contracts";

export type {
  EhmAction,
  EhmActionType,
  CooldownScope,
  CooldownBlock,
  EhmWhyBlock,
} from "@schimidt-brain/contracts";
