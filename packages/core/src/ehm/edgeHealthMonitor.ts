// ═════════════════════════════════════════════════════════════
// Edge Health Monitor (EHM)
// Avalia posições ativas e detecta assinaturas de falha de edge.
//
// Recomenda: REDUCE_RISK / EXIT_NOW / COOLDOWN
//
// Nunca:
// - Cria entrada
// - Cancela entrada antes de existir posição
// ═════════════════════════════════════════════════════════════

import {
  Severity,
  ReasonCode,
  ExecutionHealth,
  VolatilityLevel,
} from "@schimidt-brain/contracts";

import type { EhmAction, BrainIdType } from "@schimidt-brain/contracts";
import type { EhmInput, PositionResult } from "../types/inputs";

// ─── Constantes ──────────────────────────────────────────────

/** Número de perdas consecutivas para ativar cooldown */
const LOSS_STREAK_THRESHOLD = 3;
/** Percentual de perda não realizada para EXIT_NOW */
const UNREALIZED_LOSS_EXIT_THRESHOLD = -3.0;
/** Percentual de perda não realizada para REDUCE_RISK */
const UNREALIZED_LOSS_REDUCE_THRESHOLD = -1.5;
/** Ratio max_adverse / max_favorable para detectar edge morto */
const ADVERSE_FAVORABLE_RATIO_THRESHOLD = 3.0;
/** Duração máxima em minutos sem progresso para considerar edge morto */
const STALE_POSITION_MINUTES = 240;
/** Percentual mínimo de progresso esperado (favorable excursion) */
const MIN_FAVORABLE_PROGRESS_PCT = 0.3;
/** Duração do cooldown padrão em minutos */
const DEFAULT_COOLDOWN_MINUTES = 120;

// ─── Helpers ─────────────────────────────────────────────────

function addMinutesToTimestamp(ts: string, minutes: number): string {
  const date = new Date(ts);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

/**
 * Conta perdas consecutivas recentes para um brain específico.
 */
function countConsecutiveLosses(
  results: readonly PositionResult[],
  brainId: string
): number {
  let count = 0;
  // Resultados devem estar ordenados do mais recente para o mais antigo
  // Iteramos do final para o início (mais recente primeiro)
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    if (r.brain_id !== brainId) {
      continue;
    }
    if (r.pnl_pct < 0) {
      count++;
    } else {
      break; // Primeira não-perda interrompe a streak
    }
  }
  return count;
}

/**
 * Verifica se a posição está em estado de "edge morto":
 * - Muito tempo aberta sem progresso
 * - Max adverse muito maior que max favorable
 */
function isDeadEdge(
  unrealizedPnlPct: number,
  durationMinutes: number,
  maxFavorablePct: number,
  maxAdversePct: number
): boolean {
  // Posição antiga sem progresso favorável
  if (
    durationMinutes > STALE_POSITION_MINUTES &&
    maxFavorablePct < MIN_FAVORABLE_PROGRESS_PCT
  ) {
    return true;
  }

  // Max adverse muito maior que max favorable → edge morto
  if (
    maxFavorablePct > 0 &&
    maxAdversePct / maxFavorablePct > ADVERSE_FAVORABLE_RATIO_THRESHOLD
  ) {
    return true;
  }

  // Nunca teve excursão favorável significativa e está negativa
  if (maxFavorablePct < 0.1 && unrealizedPnlPct < -0.5) {
    return true;
  }

  return false;
}

// ─── Função principal ────────────────────────────────────────

/**
 * Avalia a saúde do edge de uma posição ativa.
 *
 * Pipeline:
 * 1. Verificar perda não realizada crítica → EXIT_NOW
 * 2. Verificar edge morto → EXIT_NOW
 * 3. Verificar perda não realizada moderada → REDUCE_RISK
 * 4. Verificar loss streak → COOLDOWN
 * 5. Verificar contexto de mercado degradado → REDUCE_RISK
 *
 * @returns EhmAction se ação necessária, null se posição saudável
 */
export function evaluateEdgeHealth(input: EhmInput): EhmAction | null {
  const { position, recent_results: recentResults, mcl, timestamp } = input;
  const brainId = position.brain_id as BrainIdType;

  // ─── 1. Perda não realizada crítica → EXIT_NOW ─────────────
  if (position.unrealized_pnl_pct <= UNREALIZED_LOSS_EXIT_THRESHOLD) {
    return {
      event_id: input.event_id,
      correlation_id: input.correlation_id,
      timestamp,
      severity: Severity.ERROR,
      action: "EXIT_NOW",
      affected_brains: [brainId],
      affected_symbols: [position.symbol],
      cooldown: null,
      why: {
        reason_code: ReasonCode.EHM_EXIT_NOW,
        message: `Perda não realizada crítica (${position.unrealized_pnl_pct.toFixed(1)}%) em ${position.symbol} — saída imediata ordenada`,
      },
    };
  }

  // ─── 2. Edge morto → EXIT_NOW ──────────────────────────────
  if (
    isDeadEdge(
      position.unrealized_pnl_pct,
      position.duration_minutes,
      position.max_favorable_pct,
      position.max_adverse_pct
    )
  ) {
    return {
      event_id: input.event_id,
      correlation_id: input.correlation_id,
      timestamp,
      severity: Severity.WARN,
      action: "EXIT_NOW",
      affected_brains: [brainId],
      affected_symbols: [position.symbol],
      cooldown: null,
      why: {
        reason_code: ReasonCode.EHM_EXIT_NOW,
        message: `Edge morto detectado em ${position.symbol} (brain ${brainId}): duração ${position.duration_minutes}min, max favorable ${position.max_favorable_pct.toFixed(1)}%, max adverse ${position.max_adverse_pct.toFixed(1)}%`,
      },
    };
  }

  // ─── 3. Perda não realizada moderada → REDUCE_RISK ─────────
  if (position.unrealized_pnl_pct <= UNREALIZED_LOSS_REDUCE_THRESHOLD) {
    return {
      event_id: input.event_id,
      correlation_id: input.correlation_id,
      timestamp,
      severity: Severity.WARN,
      action: "REDUCE_RISK",
      affected_brains: [brainId],
      affected_symbols: [position.symbol],
      cooldown: null,
      why: {
        reason_code: ReasonCode.EHM_REDUCE_RISK,
        message: `Perda não realizada moderada (${position.unrealized_pnl_pct.toFixed(1)}%) em ${position.symbol} — redução de risco recomendada`,
      },
    };
  }

  // ─── 4. Loss streak → COOLDOWN ─────────────────────────────
  const consecutiveLosses = countConsecutiveLosses(recentResults, brainId);
  if (consecutiveLosses >= LOSS_STREAK_THRESHOLD) {
    return {
      event_id: input.event_id,
      correlation_id: input.correlation_id,
      timestamp,
      severity: Severity.WARN,
      action: "COOLDOWN",
      affected_brains: [brainId],
      affected_symbols: [position.symbol],
      cooldown: {
        scope: "BRAIN",
        target: brainId,
        until: addMinutesToTimestamp(timestamp, DEFAULT_COOLDOWN_MINUTES),
      },
      why: {
        reason_code: ReasonCode.EHM_LOSS_STREAK,
        message: `${consecutiveLosses} perdas consecutivas detectadas para brain ${brainId} — cooldown de ${DEFAULT_COOLDOWN_MINUTES}min ativado`,
      },
    };
  }

  // ─── 5. Contexto de mercado degradado → REDUCE_RISK ───────
  if (mcl.execution_state === ExecutionHealth.DEGRADED) {
    return {
      event_id: input.event_id,
      correlation_id: input.correlation_id,
      timestamp,
      severity: Severity.WARN,
      action: "REDUCE_RISK",
      affected_brains: [brainId],
      affected_symbols: [position.symbol],
      cooldown: null,
      why: {
        reason_code: ReasonCode.EHM_HEALTH_DEGRADED,
        message: `Execução degradada detectada — redução de risco recomendada para ${position.symbol}`,
      },
    };
  }

  if (mcl.execution_state === ExecutionHealth.BROKEN) {
    return {
      event_id: input.event_id,
      correlation_id: input.correlation_id,
      timestamp,
      severity: Severity.ERROR,
      action: "EXIT_NOW",
      affected_brains: [brainId],
      affected_symbols: [position.symbol],
      cooldown: null,
      why: {
        reason_code: ReasonCode.EHM_HEALTH_BROKEN,
        message: `Execução quebrada — saída imediata de ${position.symbol} ordenada`,
      },
    };
  }

  // Volatilidade alta com posição em risco → REDUCE_RISK
  if (
    mcl.market_states.volatility === VolatilityLevel.HIGH &&
    position.unrealized_pnl_pct < 0
  ) {
    return {
      event_id: input.event_id,
      correlation_id: input.correlation_id,
      timestamp,
      severity: Severity.WARN,
      action: "REDUCE_RISK",
      affected_brains: [brainId],
      affected_symbols: [position.symbol],
      cooldown: null,
      why: {
        reason_code: ReasonCode.EHM_REDUCE_RISK,
        message: `Volatilidade alta com posição negativa em ${position.symbol} — redução de risco recomendada`,
      },
    };
  }

  // ─── Posição saudável → null ───────────────────────────────
  return null;
}
