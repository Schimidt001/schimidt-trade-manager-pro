// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — PM Decision → Executor Commands Mapping
// ═══════════════════════════════════════════════════════════════
// Função pura que converte decisões do PM em comandos para o executor.
// Respeita Gate State: G0 (Shadow) nunca gera comandos.
//
// Regras:
//   - G0 (Shadow): retorna [] sempre
//   - PM ALLOW + intent ENTER/ADJUST: SET_STRATEGY, SET_PARAMS, SET_RISK, ARM
//   - EHM EXIT_NOW: CLOSE_DAY (ou NOT_SUPPORTED se não disponível)
//   - Nunca inventa comportamento perigoso
// ═══════════════════════════════════════════════════════════════

import type { ExecutorCommand } from "./types";

// ─── Tipos de Input (compatíveis com contracts) ────────────────

/**
 * Decisão do PM simplificada para mapping.
 * Compatível com PmDecision do contracts.
 */
export interface MappingDecision {
  /** Tipo de decisão: ALLOW | DENY | QUEUE | MODIFY */
  decision: string;
  /** event_id do intent original */
  intent_event_id: string;
  /** Ajustes de risco (nullable) */
  risk_adjustments: {
    original_risk_pct: number;
    adjusted_risk_pct: number;
    adjustment_reason: string;
  } | null;
}

/**
 * Intent do Brain simplificado para mapping.
 * Compatível com BrainIntent do contracts.
 */
export interface MappingIntent {
  /** Tipo de intent: OPEN_LONG | OPEN_SHORT | CLOSE | SCALE_IN | SCALE_OUT | HEDGE */
  intent_type: string;
  /** Símbolo do ativo */
  symbol: string;
  /** Brain que gerou o intent */
  brain_id: string;
  /** Risco proposto em percentual */
  proposed_risk_pct: number;
  /** Plano de trade */
  trade_plan: {
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    timeframe: string;
  };
}

/**
 * Ação do EHM simplificada para mapping.
 */
export interface MappingEhmAction {
  /** Tipo de ação: REDUCE_RISK | EXIT_NOW | COOLDOWN */
  action: string;
  /** Símbolos afetados */
  affected_symbols: string[];
}

/**
 * Configuração do mapping.
 */
export interface MappingConfig {
  /** Gate atual: G0 | G1 | G2 | G3 */
  gate: string;
  /** Se o sistema está armado */
  armed: boolean;
  /** Estratégia atualmente ativa no executor (para evitar SET_STRATEGY desnecessário) */
  current_strategy?: string;
}

// ─── Tipos de intent que representam "entrada" ou "ajuste" ─────

const ENTER_ADJUST_INTENTS = new Set([
  "OPEN_LONG",
  "OPEN_SHORT",
  "SCALE_IN",
  "SCALE_OUT",
  "HEDGE",
]);

// ─── Mapping Principal ─────────────────────────────────────────

/**
 * Converte uma decisão PM + intent em comandos para o executor.
 * Função pura — sem side effects.
 *
 * @param decision - Decisão do PM
 * @param intent - Intent original do Brain
 * @param config - Configuração de gate/arm
 * @param ehmAction - Ação do EHM (opcional, para EXIT_NOW)
 * @returns Lista de ExecutorCommand a enviar
 */
export function mapDecisionToExecutorCommands(
  decision: MappingDecision,
  intent: MappingIntent,
  config: MappingConfig,
  ehmAction?: MappingEhmAction | null
): ExecutorCommand[] {
  const commands: ExecutorCommand[] = [];

  // ─── Regra 1: G0 (Shadow) nunca gera comandos ─────────────────
  if (config.gate === "G0") {
    return [];
  }

  // ─── Regra 2: EHM EXIT_NOW tem prioridade ─────────────────────
  if (ehmAction && ehmAction.action === "EXIT_NOW") {
    // CLOSE_DAY é o comando mais seguro disponível.
    // Se no futuro o executor tiver um comando "CLOSE_POSITIONS",
    // substituir aqui. Documentado no contrato.
    commands.push({
      type: "CLOSE_DAY",
      payload: {
        reason: "EHM_EXIT_NOW",
        affected_symbols: ehmAction.affected_symbols,
        _note: "CLOSE_DAY usado como fallback. Se executor suportar CLOSE_POSITIONS, atualizar mapping.",
      },
    });
    return commands;
  }

  // ─── Regra 3: Apenas decisões ALLOW geram comandos ────────────
  if (decision.decision !== "ALLOW") {
    return [];
  }

  // ─── Regra 4: Apenas intents de entrada/ajuste geram comandos ──
  if (!ENTER_ADJUST_INTENTS.has(intent.intent_type)) {
    // CLOSE intent não gera comando direto — o executor gerencia
    // posições abertas internamente
    return [];
  }

  // ─── Gerar comandos de configuração ────────────────────────────

  // SET_STRATEGY (apenas se diferente da atual)
  const strategyName = `${intent.brain_id}_${intent.trade_plan.timeframe}`;
  if (config.current_strategy !== strategyName) {
    commands.push({
      type: "SET_STRATEGY",
      payload: {
        strategy: strategyName,
        brain_id: intent.brain_id,
        timeframe: intent.trade_plan.timeframe,
      },
    });
  }

  // SET_PARAMS (parâmetros do trade plan)
  // CORREÇÃO: Incluir dados necessários para o simulator emitir lifecycle events
  commands.push({
    type: "SET_PARAMS",
    payload: {
      params: {
        symbol: intent.symbol,
        direction: intent.intent_type.includes("LONG") ? "LONG" : intent.intent_type.includes("SHORT") ? "SHORT" : "NEUTRAL",
        intent_type: intent.intent_type,
        entry: intent.trade_plan.entry_price,
        entry_price: intent.trade_plan.entry_price,
        stop_loss: intent.trade_plan.stop_loss,
        take_profit: intent.trade_plan.take_profit,
        timeframe: intent.trade_plan.timeframe,
        quantity: 1.0, // Mock - será substituído por position sizing real
      },
    },
  });

  // SET_RISK (se houve ajuste de risco pelo PM)
  if (decision.risk_adjustments) {
    commands.push({
      type: "SET_RISK",
      payload: {
        risk_profile: {
          max_risk_per_trade_pct: decision.risk_adjustments.adjusted_risk_pct,
        },
        original_risk_pct: decision.risk_adjustments.original_risk_pct,
        adjustment_reason: decision.risk_adjustments.adjustment_reason,
      },
    });
  }

  // SET_SYMBOLS_ACTIVE (garantir que o símbolo está ativo)
  commands.push({
    type: "SET_SYMBOLS_ACTIVE",
    payload: {
      symbols: [intent.symbol],
      action: "add",
    },
  });

  // ARM (se não estiver armado)
  if (!config.armed) {
    commands.push({
      type: "ARM",
      payload: {
        reason: "PM_ALLOW_AUTO_ARM",
        intent_event_id: decision.intent_event_id,
      },
    });
  }

  return commands;
}

/**
 * Gera um comando NOT_SUPPORTED para registrar no ledger
 * quando uma ação não é suportada pelo executor.
 *
 * @param action - Descrição da ação não suportada
 * @param context - Contexto adicional
 * @returns Objeto para logging (não é um ExecutorCommand real)
 */
export function createNotSupportedEntry(
  action: string,
  context: Record<string, unknown>
): Record<string, unknown> {
  return {
    type: "NOT_SUPPORTED",
    action,
    context,
    message: `Ação "${action}" não é suportada pelo executor atual. Requer intervenção futura.`,
    timestamp: new Date().toISOString(),
  };
}
