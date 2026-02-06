import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Brain IDs — Identificadores canônicos de cada brain do sistema
// ─────────────────────────────────────────────────────────────

/**
 * Enum canônico dos brains do Schimidt Brain.
 *
 * A2  — Brain A2
 * B3  — Brain B3
 * C3  — Brain C3
 * D2  — Brain D2
 * MCL — Market Context Layer
 * PM  — Portfolio Manager
 * EHM — Emergency & Health Manager
 */
export enum BrainId {
  A2 = "A2",
  B3 = "B3",
  C3 = "C3",
  D2 = "D2",
  MCL = "MCL",
  PM = "PM",
  EHM = "EHM",
}

/**
 * Schema Zod para brain_id.
 */
export const BrainIdSchema = z
  .nativeEnum(BrainId)
  .describe("Identificador canônico do brain");

// ─── Type inferido ───────────────────────────────────────────
export type BrainIdType = z.infer<typeof BrainIdSchema>;
