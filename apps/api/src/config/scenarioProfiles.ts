// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Scenario Profiles (G0/G1 only)
// ═══════════════════════════════════════════════════════════════
// Perfis de cenário para validação de cérebros em G0/G1.
//
// REGRAS:
// - Válido APENAS em G0 e G1
// - NÃO existe em G2 ou G3
// - NÃO persiste após o tick
// - NÃO altera config global
// - NÃO cria dívida técnica
//
// Cada perfil define overrides para o MCL input que forçam
// um contexto de mercado específico, permitindo validar que
// cada cérebro reage corretamente ao cenário.
// ═══════════════════════════════════════════════════════════════

import {
  MarketSession,
  EventProximity,
  ExecutionHealth,
} from "@schimidt-brain/contracts";

import type { GateLevel } from "./gates";

// ─── Tipos ──────────────────────────────────────────────────────

/**
 * Cenários de teste disponíveis.
 * AUTO = comportamento actual (sem override).
 */
export type TestScenario =
  | "AUTO"
  | "RANGE"
  | "TREND_CLEAN"
  | "HIGH_VOL"
  | "PRE_NEWS"
  | "POST_NEWS"
  | "LOW_LIQUIDITY"
  | "STRESS";

/**
 * Lista de cenários válidos para validação de input.
 */
export const VALID_SCENARIOS: readonly TestScenario[] = [
  "AUTO",
  "RANGE",
  "TREND_CLEAN",
  "HIGH_VOL",
  "PRE_NEWS",
  "POST_NEWS",
  "LOW_LIQUIDITY",
  "STRESS",
] as const;

/**
 * Overrides aplicados ao MCL input quando um cenário é selecionado.
 * Apenas os campos relevantes são overridden — o resto mantém-se.
 */
export interface ScenarioOverrides {
  /** Override de H1 bars: trending ou ranging */
  h1Override: "trending" | "ranging";
  /** Override de M15 bars: buildup, raid ou clean */
  m15Override: "buildup" | "raid" | "clean";
  /** Override de event_state */
  event_state: typeof EventProximity[keyof typeof EventProximity];
  /** Override de session */
  session: typeof MarketSession[keyof typeof MarketSession];
  /** Override de volume_ratio */
  volume_ratio: number;
  /** Override de correlation_index */
  correlation_index: number;
  /** Override de session_overlap */
  session_overlap: number;
  /** Override de range_expansion */
  range_expansion: number;
  /** Override de ATR multiplier (1.0 = normal, >1 = high vol, <1 = low vol) */
  atr_multiplier: number;
  /** Override de spread_bps */
  spread_bps: number;
  /** Override de execution health */
  execution_health: typeof ExecutionHealth[keyof typeof ExecutionHealth];
}

// ─── Perfis de Cenário ──────────────────────────────────────────

/**
 * RANGE: Mercado lateral, buildup de liquidez.
 * Esperado: A2 (Liquidity Predator) encontra edge.
 * B3 pode encontrar edge se correlação for baixa.
 * C3 NÃO encontra edge (precisa de TREND).
 * D2 NÃO encontra edge (precisa de evento).
 */
const RANGE_PROFILE: ScenarioOverrides = {
  h1Override: "ranging",
  m15Override: "buildup",
  event_state: EventProximity.NONE,
  session: MarketSession.LONDON,
  volume_ratio: 0.7,
  correlation_index: 0.5,
  session_overlap: 0.5,
  range_expansion: 1.0,
  atr_multiplier: 1.0,
  spread_bps: 5,
  execution_health: ExecutionHealth.OK,
};

/**
 * TREND_CLEAN: Tendência limpa com volume forte.
 * Esperado: C3 (Momentum) encontra edge (TREND + CLEAN + volume).
 * A2 NÃO encontra edge (precisa de BUILDUP/RAID).
 * B3 pode encontrar edge se correlação for adequada.
 * D2 NÃO encontra edge (precisa de evento).
 */
const TREND_CLEAN_PROFILE: ScenarioOverrides = {
  h1Override: "trending",
  m15Override: "clean",
  event_state: EventProximity.NONE,
  session: MarketSession.LONDON,
  volume_ratio: 1.5,
  correlation_index: 0.5,
  session_overlap: 0.4,
  range_expansion: 1.0,
  atr_multiplier: 1.0,
  spread_bps: 5,
  execution_health: ExecutionHealth.OK,
};

/**
 * HIGH_VOL: Volatilidade alta, mercado em transição.
 * Esperado: NENHUM cérebro encontra edge.
 * A2 bloqueia (volatility HIGH).
 * B3 bloqueia (volatility HIGH).
 * C3 bloqueia (precisa TREND, e vol HIGH + early = skip).
 * D2 bloqueia (sem evento).
 * Resultado: NO_TRADE — validação de que o sistema para em vol alta.
 */
const HIGH_VOL_PROFILE: ScenarioOverrides = {
  h1Override: "ranging",
  m15Override: "clean",
  event_state: EventProximity.NONE,
  session: MarketSession.NY,
  volume_ratio: 1.1,
  correlation_index: 0.5,
  session_overlap: 0.4,
  range_expansion: 1.5,
  atr_multiplier: 3.0, // ATR 3x normal → classifyVolatility retorna HIGH
  spread_bps: 5,
  execution_health: ExecutionHealth.OK,
};

/**
 * PRE_NEWS: Pré-evento macro.
 * Esperado: D2 (News) gera HEDGE defensivo.
 * A2 bloqueia (event_proximity PRE_EVENT).
 * B3 bloqueia (event_proximity != NONE).
 * C3 pode ou não encontrar edge (depende de structure).
 * Resultado: D2 activo, outros bloqueados.
 */
const PRE_NEWS_PROFILE: ScenarioOverrides = {
  h1Override: "ranging",
  m15Override: "clean",
  event_state: EventProximity.PRE_EVENT,
  session: MarketSession.NY,
  volume_ratio: 1.1,
  correlation_index: 0.5,
  session_overlap: 0.4,
  range_expansion: 1.0,
  atr_multiplier: 1.0,
  spread_bps: 10,
  execution_health: ExecutionHealth.OK,
};

/**
 * POST_NEWS: Pós-evento macro com momentum.
 * Esperado: D2 (News) gera trade direcional pós-evento.
 * A2 pode encontrar edge se liquidez for BUILDUP.
 * B3 bloqueia (event_proximity != NONE).
 * C3 depende de structure.
 * Resultado: D2 activo com momentum.
 */
const POST_NEWS_PROFILE: ScenarioOverrides = {
  h1Override: "ranging",
  m15Override: "clean",
  event_state: EventProximity.POST_EVENT,
  session: MarketSession.NY,
  volume_ratio: 1.3,
  correlation_index: 0.5,
  session_overlap: 0.4,
  range_expansion: 1.0,
  atr_multiplier: 1.2,
  spread_bps: 15,
  execution_health: ExecutionHealth.OK,
};

/**
 * LOW_LIQUIDITY: Baixa liquidez, volume reduzido.
 * Esperado: A2 pode encontrar edge (BUILDUP).
 * B3 bloqueia (volume_ratio < 0.5).
 * C3 bloqueia (volume_ratio < 0.9).
 * D2 bloqueia (sem evento).
 * Resultado: Apenas A2 pode operar, com cautela.
 */
const LOW_LIQUIDITY_PROFILE: ScenarioOverrides = {
  h1Override: "ranging",
  m15Override: "buildup",
  event_state: EventProximity.NONE,
  session: MarketSession.ASIA,
  volume_ratio: 0.4,
  correlation_index: 0.5,
  session_overlap: 0.6,
  range_expansion: 0.8,
  atr_multiplier: 0.5, // ATR baixo → classifyVolatility retorna LOW
  spread_bps: 3,
  execution_health: ExecutionHealth.OK,
};

/**
 * STRESS: Cenário extremo — vol alta + raid + pré-evento.
 * Esperado: D2 pode gerar HEDGE (pré-evento).
 * A2 bloqueia (PRE_EVENT + HIGH vol).
 * B3 bloqueia (HIGH vol + PRE_EVENT).
 * C3 bloqueia (não é TREND).
 * Resultado: Apenas D2 hedge (se possível), sistema defensivo.
 */
const STRESS_PROFILE: ScenarioOverrides = {
  h1Override: "ranging",
  m15Override: "raid",
  event_state: EventProximity.PRE_EVENT,
  session: MarketSession.NY,
  volume_ratio: 2.0,
  correlation_index: 0.3,
  session_overlap: 0.2,
  range_expansion: 2.0,
  atr_multiplier: 3.5, // ATR muito alto → HIGH vol
  spread_bps: 25,
  execution_health: ExecutionHealth.DEGRADED,
};

// ─── Registry ───────────────────────────────────────────────────

/**
 * Mapa de cenário → overrides.
 * AUTO não tem overrides (retorna null).
 */
const SCENARIO_PROFILES: Record<TestScenario, ScenarioOverrides | null> = {
  AUTO: null,
  RANGE: RANGE_PROFILE,
  TREND_CLEAN: TREND_CLEAN_PROFILE,
  HIGH_VOL: HIGH_VOL_PROFILE,
  PRE_NEWS: PRE_NEWS_PROFILE,
  POST_NEWS: POST_NEWS_PROFILE,
  LOW_LIQUIDITY: LOW_LIQUIDITY_PROFILE,
  STRESS: STRESS_PROFILE,
};

// ─── API Pública ────────────────────────────────────────────────

/**
 * Verifica se um cenário é válido.
 */
export function isValidScenario(scenario: string): scenario is TestScenario {
  return VALID_SCENARIOS.includes(scenario as TestScenario);
}

/**
 * Verifica se o gate actual permite uso de cenários.
 * Cenários APENAS em G0 e G1.
 */
export function isScenarioAllowed(gate: GateLevel): boolean {
  return gate === "G0" || gate === "G1";
}

/**
 * Obtém os overrides para um cenário.
 * Retorna null para AUTO (sem overrides).
 */
export function getScenarioOverrides(scenario: TestScenario): ScenarioOverrides | null {
  return SCENARIO_PROFILES[scenario] ?? null;
}
