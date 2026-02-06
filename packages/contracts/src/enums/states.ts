import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// States — Enums canônicos de estado do mercado
// ─────────────────────────────────────────────────────────────

/**
 * Estrutura de mercado.
 */
export enum MarketStructure {
  TREND = "TREND",
  RANGE = "RANGE",
  TRANSITION = "TRANSITION",
}

export const MarketStructureSchema = z
  .nativeEnum(MarketStructure)
  .describe("Estrutura de mercado: TREND | RANGE | TRANSITION");

/**
 * Nível de volatilidade.
 */
export enum VolatilityLevel {
  LOW = "LOW",
  NORMAL = "NORMAL",
  HIGH = "HIGH",
}

export const VolatilityLevelSchema = z
  .nativeEnum(VolatilityLevel)
  .describe("Nível de volatilidade: LOW | NORMAL | HIGH");

/**
 * Fase de liquidez.
 */
export enum LiquidityPhase {
  BUILDUP = "BUILDUP",
  RAID = "RAID",
  CLEAN = "CLEAN",
}

export const LiquidityPhaseSchema = z
  .nativeEnum(LiquidityPhase)
  .describe("Fase de liquidez: BUILDUP | RAID | CLEAN");

/**
 * Sessão de mercado.
 */
export enum MarketSession {
  ASIA = "ASIA",
  LONDON = "LONDON",
  NY = "NY",
}

export const MarketSessionSchema = z
  .nativeEnum(MarketSession)
  .describe("Sessão de mercado: ASIA | LONDON | NY");

/**
 * Proximidade de evento macro.
 */
export enum EventProximity {
  NONE = "NONE",
  PRE_EVENT = "PRE_EVENT",
  POST_EVENT = "POST_EVENT",
}

export const EventProximitySchema = z
  .nativeEnum(EventProximity)
  .describe("Proximidade de evento: NONE | PRE_EVENT | POST_EVENT");

// ─── Types inferidos ─────────────────────────────────────────
export type MarketStructureType = z.infer<typeof MarketStructureSchema>;
export type VolatilityLevelType = z.infer<typeof VolatilityLevelSchema>;
export type LiquidityPhaseType = z.infer<typeof LiquidityPhaseSchema>;
export type MarketSessionType = z.infer<typeof MarketSessionSchema>;
export type EventProximityType = z.infer<typeof EventProximitySchema>;
