// ═════════════════════════════════════════════════════════════
// Brains — Barrel Export
// Cada brain é uma função pura: generateIntent(input) → BRAIN_INTENT | null
// ═════════════════════════════════════════════════════════════

import { generateIntent as generateA2Intent } from "./A2";
import { generateIntent as generateB3Intent } from "./B3";
import { generateIntent as generateC3Intent } from "./C3";
import { generateIntent as generateD2Intent } from "./D2";

import type { BrainIntent } from "@schimidt-brain/contracts";
import type { BrainInput } from "../types/inputs";

export { generateA2Intent, generateB3Intent, generateC3Intent, generateD2Intent };

/**
 * Tipo de uma função geradora de intent.
 */
export type IntentGenerator = (input: BrainInput) => BrainIntent | null;

/**
 * Registry de todos os brains disponíveis.
 * Útil para o Agent 4 iterar sobre todos os brains.
 */
export const BRAIN_REGISTRY: ReadonlyMap<string, IntentGenerator> = new Map([
  ["A2", generateA2Intent],
  ["B3", generateB3Intent],
  ["C3", generateC3Intent],
  ["D2", generateD2Intent],
]);
