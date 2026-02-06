import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Execution — Estado de saúde da execução
// ─────────────────────────────────────────────────────────────

/**
 * Estado de saúde da camada de execução.
 */
export enum ExecutionHealth {
  OK = "OK",
  DEGRADED = "DEGRADED",
  BROKEN = "BROKEN",
}

export const ExecutionHealthSchema = z
  .nativeEnum(ExecutionHealth)
  .describe("Estado de saúde da execução: OK | DEGRADED | BROKEN");

// ─── Type inferido ───────────────────────────────────────────
export type ExecutionHealthType = z.infer<typeof ExecutionHealthSchema>;
