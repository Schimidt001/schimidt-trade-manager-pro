// ═════════════════════════════════════════════════════════════
// Hand-off Authorization
// Valida se um intent de SCALE_IN, SCALE_OUT ou CLOSE é permitido.
// Função pura — sem I/O, sem estado externo.
// ═════════════════════════════════════════════════════════════

import { ReasonCode } from "@schimidt-brain/contracts";
import type { BrainIntent } from "@schimidt-brain/contracts";
import type { PortfolioState, OpenPosition } from "../types/inputs";

// ─── Tipos internos ──────────────────────────────────────────

export interface HandoffCheckResult {
  readonly allowed: boolean;
  readonly reason_code: ReasonCode | null;
  readonly message: string;
}

// ─── Tipos de intent que são hand-offs ───────────────────────

const HANDOFF_INTENT_TYPES = new Set(["SCALE_IN", "SCALE_OUT", "CLOSE"]);

// ─── Função principal ────────────────────────────────────────

/**
 * Verifica se um intent é um hand-off e se é permitido.
 *
 * Hand-offs são operações sobre posições existentes:
 * - SCALE_IN: aumentar posição existente
 * - SCALE_OUT: reduzir posição existente
 * - CLOSE: fechar posição existente
 *
 * Para ser válido:
 * 1. Deve existir posição aberta no símbolo
 * 2. O brain deve ser o mesmo que abriu a posição (ou PM/EHM)
 * 3. SCALE_IN respeita limites de exposição
 */
export function checkHandoff(
  intent: BrainIntent,
  portfolio: PortfolioState
): HandoffCheckResult {
  // Se não é hand-off, não se aplica
  if (!HANDOFF_INTENT_TYPES.has(intent.intent_type)) {
    return {
      allowed: true,
      reason_code: null,
      message: "Intent não é hand-off — verificação não aplicável",
    };
  }

  // Buscar posição existente no símbolo
  const existingPosition = findMatchingPosition(
    portfolio.positions,
    intent.symbol,
    intent.brain_id
  );

  if (existingPosition === null) {
    return {
      allowed: false,
      reason_code: ReasonCode.PM_POSITION_DENIED,
      message: `Hand-off ${intent.intent_type} negado: não existe posição aberta em ${intent.symbol} para brain ${intent.brain_id}`,
    };
  }

  // CLOSE e SCALE_OUT são sempre permitidos se a posição existe
  if (
    intent.intent_type === "CLOSE" ||
    intent.intent_type === "SCALE_OUT"
  ) {
    return {
      allowed: true,
      reason_code: null,
      message: `Hand-off ${intent.intent_type} permitido para posição existente em ${intent.symbol}`,
    };
  }

  // SCALE_IN: verificar se não excede limites
  // (a verificação de exposição completa é feita pelo exposureGovernor)
  return {
    allowed: true,
    reason_code: null,
    message: `Hand-off SCALE_IN permitido para posição existente em ${intent.symbol} — exposição será verificada pelo governor`,
  };
}

/**
 * Verifica se um intent é do tipo hand-off.
 */
export function isHandoff(intentType: string): boolean {
  return HANDOFF_INTENT_TYPES.has(intentType);
}

// ─── Helpers ─────────────────────────────────────────────────

function findMatchingPosition(
  positions: readonly OpenPosition[],
  symbol: string,
  brainId: string
): OpenPosition | null {
  for (const pos of positions) {
    if (pos.symbol === symbol && pos.brain_id === brainId) {
      return pos;
    }
  }
  return null;
}
