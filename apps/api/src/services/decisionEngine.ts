// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Decision Engine
// ═══════════════════════════════════════════════════════════════
// Pipeline de decisão: MCL → Brains → PM → (EHM hook)
// Usa packages/core para lógica pura.
// Persiste cada evento via ledgerService.
// Respeita Gate State (G0 shadow = não envia comandos).
// ═══════════════════════════════════════════════════════════════

import {
  computeMarketContext,
  BRAIN_REGISTRY,
  evaluateIntent,
} from "@schimidt-brain/core";
import type {
  MclInput,
  BrainInput,
  PmInput,
  RiskLimits,
  PortfolioState,
} from "@schimidt-brain/core";
import type { MclSnapshot, BrainIntent, PmDecision } from "@schimidt-brain/core";
import {
  MarketSession,
  EventProximity,
  ExecutionHealth,
  GlobalMode,
} from "@schimidt-brain/contracts";
import { mapDecisionToExecutorCommands } from "@schimidt-brain/adapters";
import type { MappingDecision, MappingIntent, MappingConfig } from "@schimidt-brain/adapters";
import type { LedgerEventInput } from "@schimidt-brain/db";
import type { Component } from "@schimidt-brain/db";
import { persistEvent } from "./ledgerService";
import { applyCommands } from "./executorService";
import { newEventId, newCorrelationId, nowISO } from "../utils/correlation";
import {
  getOperationalState,
  canSendCommands,
  setGlobalMode,
} from "../config/gates";

// ─── Tipos ──────────────────────────────────────────────────────

export interface TickInput {
  symbols: string[];
}

export interface TickResult {
  correlation_id: string;
  timestamp: string;
  gate: string;
  commands_sent: boolean;
  events_persisted: number;
  snapshots: MclSnapshot[];
  intents: BrainIntent[];
  decisions: PmDecision[];
}

// ─── Default Risk Limits & Portfolio State (mock para Shadow) ───

const DEFAULT_RISK_LIMITS: RiskLimits = {
  max_drawdown_pct: 10,
  max_exposure_pct: 30,
  max_daily_loss_pct: 5,
  max_positions: 8,
  max_exposure_per_symbol_pct: 10,
  max_exposure_per_currency_pct: 20,
  max_correlated_exposure_pct: 25,
};

function resolveGlobalMode(): GlobalMode {
  const mode = getOperationalState().global_mode;
  if (Object.values(GlobalMode).includes(mode as GlobalMode)) {
    return mode as GlobalMode;
  }
  return GlobalMode.NORMAL;
}

function getDefaultPortfolioState(): PortfolioState {
  return {
    risk_state: {
      current_drawdown_pct: 0,
      current_exposure_pct: 0,
      open_positions: 0,
      daily_loss_pct: 0,
      available_risk_pct: DEFAULT_RISK_LIMITS.max_exposure_pct,
    },
    positions: [],
    risk_limits: DEFAULT_RISK_LIMITS,
    global_mode: resolveGlobalMode(),
    cooldowns: [],
  };
}

// ─── Mock MCL Input Builder ─────────────────────────────────────

function buildMockMclInput(
  symbol: string,
  eventId: string,
  correlationId: string,
  timestamp: string
): MclInput {
  const basePrice = symbol.includes("BTC") ? 45000 : 1.08;
  return {
    symbol,
    timestamp,
    ohlc: {
      D1: [
        { open: basePrice, high: basePrice * 1.01, low: basePrice * 0.99, close: basePrice * 1.005, volume: 10000, timestamp },
      ],
      H4: [
        { open: basePrice, high: basePrice * 1.008, low: basePrice * 0.995, close: basePrice * 1.003, volume: 5000, timestamp },
      ],
      H1: [
        { open: basePrice * 0.998, high: basePrice * 1.002, low: basePrice * 0.997, close: basePrice * 0.999, volume: 2000, timestamp },
        { open: basePrice * 0.999, high: basePrice * 1.004, low: basePrice * 0.998, close: basePrice * 1.001, volume: 2200, timestamp },
        { open: basePrice * 1.001, high: basePrice * 1.006, low: basePrice * 1.000, close: basePrice * 1.005, volume: 2500, timestamp },
      ],
      M15: [
        { open: basePrice * 1.003, high: basePrice * 1.006, low: basePrice * 1.002, close: basePrice * 1.004, volume: 800, timestamp },
        { open: basePrice * 1.004, high: basePrice * 1.007, low: basePrice * 1.003, close: basePrice * 1.005, volume: 900, timestamp },
      ],
    },
    metrics: {
      atr: basePrice * 0.008,
      spread_bps: 5,
      volume_ratio: 1.1,
      correlation_index: 0.3,
      session_overlap: 0.4,
      range_expansion: 1.0,
    },
    session: MarketSession.LONDON,
    event_state: EventProximity.NONE,
    execution: {
      health: ExecutionHealth.OK,
      latency_ms: 50,
      last_spread_bps: 5,
      last_slippage_bps: 1,
    },
    global_mode: resolveGlobalMode(),
    event_id: eventId,
    correlation_id: correlationId,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

const BRAIN_COMPONENT_MAP: Record<string, Component> = {
  A2: "A2",
  B3: "B3",
  C3: "C3",
  D2: "D2",
};

function brainToComponent(brainId: string): Component {
  return BRAIN_COMPONENT_MAP[brainId] ?? "SYSTEM";
}

// ─── Pipeline Principal ─────────────────────────────────────────

/**
 * Executa um ciclo completo de decisão (tick).
 *
 * Pipeline:
 * 1. Para cada símbolo: gerar MCL snapshot
 * 2. Para cada snapshot: rodar todos os brains
 * 3. Para cada intent: PM decide
 * 4. Persistir todos os eventos no ledger
 * 5. Se gate permite e ARMED: preparar comandos (placeholder)
 *
 * @param input - Lista de símbolos para processar
 */
export async function runTick(input: TickInput): Promise<TickResult> {
  const correlationId = newCorrelationId();
  const timestamp = nowISO();
  const opsState = getOperationalState();

  const snapshots: MclSnapshot[] = [];
  const intents: BrainIntent[] = [];
  const decisions: PmDecision[] = [];
  const eventsToStore: LedgerEventInput[] = [];

  // ─── 1. MCL Snapshots ───────────────────────────────────────
  for (const symbol of input.symbols) {
    const mclEventId = newEventId();
    const mclInput = buildMockMclInput(symbol, mclEventId, correlationId, timestamp);
    const snapshot = computeMarketContext(mclInput);
    snapshots.push(snapshot);

    // Atualizar global_mode no estado operacional
    setGlobalMode(snapshot.global_mode);

    eventsToStore.push({
      event_id: snapshot.event_id,
      correlation_id: snapshot.correlation_id,
      timestamp: snapshot.timestamp,
      severity: snapshot.severity,
      event_type: "MCL_SNAPSHOT",
      component: "MCL",
      symbol: snapshot.symbol,
      brain_id: null,
      reason_code: snapshot.why.reason_code,
      payload: snapshot as unknown as Record<string, unknown>,
    });

    // ─── 2. Brains ──────────────────────────────────────────────
    for (const [brainId, generateIntent] of BRAIN_REGISTRY) {
      const brainInput: BrainInput = {
        mcl: snapshot,
        symbol,
        timestamp,
        event_id: newEventId(),
        correlation_id: correlationId,
      };

      const intent = generateIntent(brainInput);
      if (intent === null) continue;

      intents.push(intent);

      eventsToStore.push({
        event_id: intent.event_id,
        correlation_id: intent.correlation_id,
        timestamp: intent.timestamp,
        severity: intent.severity,
        event_type: "BRAIN_INTENT",
        component: brainToComponent(brainId),
        symbol: intent.symbol,
        brain_id: intent.brain_id,
        reason_code: intent.why.reason_code,
        payload: intent as unknown as Record<string, unknown>,
      });

      // ─── 3. PM Decision ─────────────────────────────────────────
      const pmInput: PmInput = {
        intent,
        portfolio: getDefaultPortfolioState(),
        timestamp,
        event_id: newEventId(),
        correlation_id: correlationId,
      };

      const decision = evaluateIntent(pmInput);
      decisions.push(decision);

      eventsToStore.push({
        event_id: decision.event_id,
        correlation_id: decision.correlation_id,
        timestamp: decision.timestamp,
        severity: decision.severity,
        event_type: "PM_DECISION",
        component: "PM",
        symbol,
        brain_id: brainId,
        reason_code: decision.why.reason_code,
        payload: decision as unknown as Record<string, unknown>,
      });
    }
  }

  // ─── 4. Persistir todos os eventos ──────────────────────────
  let eventsPersisted = 0;
  for (const event of eventsToStore) {
    try {
      const inserted = await persistEvent(event);
      if (inserted) eventsPersisted++;
    } catch (err) {
      // Log error but continue — não perder outros eventos
      console.error(`Erro ao persistir evento ${event.event_id}:`, err);
    }
  }

  // ─── 5. Comandos ao executor (Agente 6) ──────────────────────
  const commandsSent = canSendCommands();
  if (commandsSent) {
    const mappingConfig: MappingConfig = {
      gate: opsState.gate,
      armed: opsState.arm_state === "ARMED",
    };

    for (let i = 0; i < decisions.length; i++) {
      const decision = decisions[i];
      const intent = intents[i];
      if (!decision || !intent) continue;

      const mappingDecision: MappingDecision = {
        decision: decision.decision,
        intent_event_id: decision.intent_event_id,
        risk_adjustments: decision.risk_adjustments,
      };

      const mappingIntent: MappingIntent = {
        intent_type: intent.intent_type,
        symbol: intent.symbol,
        brain_id: intent.brain_id,
        proposed_risk_pct: intent.proposed_risk_pct,
        trade_plan: intent.trade_plan,
      };

      const executorCommands = mapDecisionToExecutorCommands(
        mappingDecision,
        mappingIntent,
        mappingConfig
      );

      if (executorCommands.length > 0) {
        try {
          await applyCommands(executorCommands, correlationId);
        } catch (err) {
          console.error("Erro ao enviar comandos ao executor:", err);
        }
      }
    }
  }

  return {
    correlation_id: correlationId,
    timestamp,
    gate: opsState.gate,
    commands_sent: commandsSent,
    events_persisted: eventsPersisted,
    snapshots,
    intents,
    decisions,
  };
}
