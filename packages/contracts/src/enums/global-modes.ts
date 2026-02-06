import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Global Modes — Modos operacionais globais do sistema
// ─────────────────────────────────────────────────────────────

/**
 * Modo operacional global do Schimidt Brain.
 *
 * NORMAL        — Operação padrão
 * EVENT_CLUSTER — Cluster de eventos macro ativos
 * FLOW_PAYING   — Fluxo institucional pagando
 * CORR_BREAK    — Quebra de correlação detectada
 * RISK_OFF      — Modo de proteção / risk-off
 */
export enum GlobalMode {
  NORMAL = "NORMAL",
  EVENT_CLUSTER = "EVENT_CLUSTER",
  FLOW_PAYING = "FLOW_PAYING",
  CORR_BREAK = "CORR_BREAK",
  RISK_OFF = "RISK_OFF",
}

export const GlobalModeSchema = z
  .nativeEnum(GlobalMode)
  .describe("Modo operacional global: NORMAL | EVENT_CLUSTER | FLOW_PAYING | CORR_BREAK | RISK_OFF");

// ─── Type inferido ───────────────────────────────────────────
export type GlobalModeType = z.infer<typeof GlobalModeSchema>;
