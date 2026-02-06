import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Severity — nível de severidade canônico
// Usado em schemas que exigem classificação de gravidade
// ─────────────────────────────────────────────────────────────

/**
 * Enum canônico de severidade.
 */
export enum Severity {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

/**
 * Schema Zod para severity.
 */
export const SeveritySchema = z
  .nativeEnum(Severity)
  .describe("Nível de severidade: INFO | WARN | ERROR");

// ─── Type inferido ───────────────────────────────────────────
export type SeverityType = z.infer<typeof SeveritySchema>;
