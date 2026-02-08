// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Replay Narrative Service
// ═══════════════════════════════════════════════════════════════
// Transforma eventos crus do ledger em narrativa do dia.
// Replay NÃO é JSON cru — é história do dia.
//
// Responsabilidades:
//   1. Agrupar eventos por dia
//   2. Gerar timeline sequencial com horário
//   3. Identificar qual cérebro atuou, por que atuou, por que outros não atuaram
//   4. Gerar resumo narrativo do dia
//   5. Gerar explicação de "não operação"
// ═══════════════════════════════════════════════════════════════

import { REASON_CODE_CATALOG } from "@schimidt-brain/contracts";
import type { LedgerEventRow, AuditLogRow } from "@schimidt-brain/db";

// ─── Types ──────────────────────────────────────────────────────

/**
 * Entrada individual na timeline narrativa do dia.
 * Formato: "04:00 — MCL: TRANSITION / CLEAN"
 */
export interface NarrativeTimelineEntry {
  /** Timestamp ISO original */
  timestamp: string;
  /** Horário formatado HH:MM:SS (UTC-3) */
  time: string;
  /** Componente que gerou o evento (MCL, A2, B3, C3, D2, PM, EHM, SYSTEM) */
  component: string;
  /** Tipo do evento (MCL_SNAPSHOT, BRAIN_INTENT, BRAIN_SKIP, PM_DECISION, etc.) */
  event_type: string;
  /** Descrição narrativa curta do evento */
  narrative: string;
  /** Severidade (INFO, WARN, ERROR) */
  severity: string;
  /** Reason code se existir */
  reason_code: string | null;
  /** Descrição humana do reason code */
  reason_description: string | null;
  /** Símbolo se existir */
  symbol: string | null;
  /** Brain ID se existir */
  brain_id: string | null;
  /** Categoria para agrupamento visual */
  category: "mcl" | "brain_action" | "brain_skip" | "pm_decision" | "ops_action" | "system" | "audit";
  /** Payload resumido (campos-chave, não JSON cru completo) */
  key_data: Record<string, unknown>;
}

/**
 * Explicação de por que um cérebro não atuou.
 */
export interface BrainSkipExplanation {
  /** ID do cérebro (A2, B3, C3, D2) */
  brain_id: string;
  /** Nome descritivo do cérebro */
  brain_name: string;
  /** Se o cérebro atuou (gerou intent) ou não */
  acted: boolean;
  /** Tipo de ação se atuou */
  action_type: string | null;
  /** Símbolo se atuou */
  symbol: string | null;
  /** Reason code do skip se não atuou */
  skip_reason_code: string | null;
  /** Descrição humana do motivo de não atuação */
  skip_explanation: string;
  /** Timestamp do evento relevante */
  timestamp: string | null;
}

/**
 * Resumo narrativo do dia.
 */
export interface DayNarrativeSummary {
  /** Data do dia (YYYY-MM-DD) */
  date: string;
  /** Título narrativo do dia */
  title: string;
  /** Resumo em linguagem natural */
  summary: string;
  /** Resultado final do dia */
  outcome: "TRADE_EXECUTED" | "NO_TRADE" | "PARTIAL" | "ERROR" | "EMPTY";
  /** Explicação do resultado */
  outcome_explanation: string;
  /** Contadores */
  stats: {
    total_events: number;
    mcl_snapshots: number;
    brain_intents: number;
    brain_skips: number;
    pm_decisions: number;
    pm_approvals: number;
    pm_denials: number;
    ops_actions: number;
    audit_logs: number;
    errors: number;
    warnings: number;
  };
  /** Cérebros que atuaram */
  active_brains: string[];
  /** Cérebros que não atuaram */
  inactive_brains: string[];
  /** Símbolos envolvidos */
  symbols_involved: string[];
  /** Se o dia foi encerrado corretamente */
  day_closed_correctly: boolean;
}

/**
 * Explicação completa de "por que não operamos".
 */
export interface WhyNoTradeExplanation {
  /** Se houve trade ou não */
  had_trade: boolean;
  /** Resumo em linguagem natural */
  summary: string;
  /** Explicações por cérebro */
  brain_explanations: BrainSkipExplanation[];
  /** Decisão final do PM */
  pm_final_decision: string | null;
  /** Reason codes envolvidos na não-operação */
  blocking_reasons: Array<{
    reason_code: string;
    description: string;
    component: string;
    count: number;
  }>;
}

/**
 * Resultado completo da narrativa de um dia de replay.
 */
export interface ReplayDayNarrative {
  date: string;
  summary: DayNarrativeSummary;
  timeline: NarrativeTimelineEntry[];
  why_no_trade: WhyNoTradeExplanation;
  brain_explanations: BrainSkipExplanation[];
}

// ─── Brain Names ────────────────────────────────────────────────

const BRAIN_NAMES: Record<string, string> = {
  A2: "Structure Brain (A2)",
  B3: "Value Brain (B3)",
  C3: "Momentum Brain (C3)",
  D2: "News Brain (D2)",
};

const ALL_BRAIN_IDS = ["A2", "B3", "C3", "D2"];

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Converte Date ou string para ISO string.
 */
function toISOString(ts: Date | string): string {
  if (ts instanceof Date) return ts.toISOString();
  return String(ts);
}

/**
 * Formata timestamp (Date ou string ISO) para HH:MM:SS (UTC-3 / São Paulo).
 */
function formatTimeBR(ts: Date | string): string {
  try {
    const d = ts instanceof Date ? ts : new Date(ts);
    return d.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return String(ts);
  }
}

/**
 * Obtém descrição humana de um reason code.
 */
function getReasonDescription(code: string | null): string | null {
  if (!code) return null;
  return (REASON_CODE_CATALOG as Record<string, string>)[code] ?? code;
}

/**
 * Extrai campos-chave do payload para exibição resumida.
 */
function extractKeyData(eventType: string, payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  switch (eventType) {
    case "MCL_SNAPSHOT": {
      if (payload.states) {
        const states = payload.states as Record<string, unknown>;
        result.structure = states.market_structure ?? null;
        result.volatility = states.volatility ?? null;
        result.liquidity = states.liquidity_phase ?? null;
        result.session = states.session ?? null;
        result.event_proximity = states.event_proximity ?? null;
      }
      if (payload.why) {
        result.why = payload.why;
      }
      result.global_mode = payload.global_mode ?? null;
      break;
    }
    case "BRAIN_INTENT": {
      result.intent_type = payload.intent_type ?? null;
      result.symbol = payload.symbol ?? null;
      result.brain_id = payload.brain_id ?? null;
      result.confidence = payload.confidence ?? null;
      if (payload.trade_plan) {
        const plan = payload.trade_plan as Record<string, unknown>;
        result.direction = plan.direction ?? null;
        result.entry = plan.entry ?? null;
        result.stop_loss = plan.stop_loss ?? null;
        result.take_profit = plan.take_profit ?? null;
      }
      if (payload.why) {
        result.why = payload.why;
      }
      break;
    }
    case "BRAIN_SKIP": {
      result.brain_id = payload.brain_id ?? null;
      result.symbol = payload.symbol ?? null;
      result.reason_code = payload.reason_code ?? null;
      result.reason = payload.reason ?? null;
      if (payload.why) {
        result.why = payload.why;
      }
      break;
    }
    case "PM_DECISION": {
      result.decision_type = payload.decision_type ?? null;
      result.symbol = payload.symbol ?? null;
      result.brain_id = payload.brain_id ?? null;
      result.reason_code = payload.reason_code ?? null;
      if (payload.risk_adjustments) {
        result.risk_adjustments = payload.risk_adjustments;
      }
      if (payload.why) {
        result.why = payload.why;
      }
      break;
    }
    case "EHM_ACTION": {
      result.action_type = payload.action_type ?? null;
      result.target = payload.target ?? null;
      if (payload.cooldown) {
        result.cooldown = payload.cooldown;
      }
      if (payload.why) {
        result.why = payload.why;
      }
      break;
    }
    default: {
      // Para outros tipos, extrair campos comuns
      if (payload.reason_code) result.reason_code = payload.reason_code;
      if (payload.reason) result.reason = payload.reason;
      if (payload.why) result.why = payload.why;
      if (payload.action) result.action = payload.action;
      break;
    }
  }

  return result;
}

/**
 * Gera a descrição narrativa curta de um evento.
 */
function generateEventNarrative(
  eventType: string,
  component: string,
  payload: Record<string, unknown>,
  reasonCode: string | null,
  symbol: string | null,
  brainId: string | null
): string {
  switch (eventType) {
    case "MCL_SNAPSHOT": {
      const states = payload.states as Record<string, unknown> | undefined;
      const structure = states?.market_structure ?? "—";
      const liquidity = states?.liquidity_phase ?? "—";
      const volatility = states?.volatility ?? "—";
      const session = states?.session ?? "—";
      const mode = payload.global_mode ?? "—";
      return `MCL: ${structure} / ${liquidity} (vol: ${volatility}, sessão: ${session}, modo: ${mode})`;
    }
    case "BRAIN_INTENT": {
      const intentType = payload.intent_type ?? "UNKNOWN";
      const brain = brainId ?? component;
      const sym = symbol ?? payload.symbol ?? "—";
      const confidence = payload.confidence ? ` (conf: ${payload.confidence})` : "";
      const direction = (payload.trade_plan as Record<string, unknown>)?.direction ?? "";
      return `${brain}: INTENT ${intentType} ${direction} ${sym}${confidence}`;
    }
    case "BRAIN_SKIP": {
      const brain = brainId ?? component;
      const reasonDesc = getReasonDescription(reasonCode) ?? (payload.reason as string) ?? "sem motivo registrado";
      return `${brain}: SKIP (${reasonDesc})`;
    }
    case "PM_DECISION": {
      const decType = payload.decision_type ?? "UNKNOWN";
      const sym = symbol ?? payload.symbol ?? "—";
      const brain = brainId ?? "—";
      const reasonDesc = getReasonDescription(reasonCode) ?? "";
      if (String(decType).includes("ALLOWED") || String(decType).includes("APPROVED")) {
        return `PM: APROVADO para ${brain} em ${sym}${reasonDesc ? ` — ${reasonDesc}` : ""}`;
      }
      if (String(decType).includes("DENIED") || String(decType).includes("REJECTED")) {
        return `PM: NEGADO para ${brain} em ${sym}${reasonDesc ? ` — ${reasonDesc}` : ""}`;
      }
      return `PM: ${decType} para ${brain} em ${sym}${reasonDesc ? ` — ${reasonDesc}` : ""}`;
    }
    case "EHM_ACTION": {
      const actionType = payload.action_type ?? "UNKNOWN";
      return `EHM: ${actionType}${reasonCode ? ` — ${getReasonDescription(reasonCode)}` : ""}`;
    }
    case "EXEC_STATE_CHANGE": {
      const newState = payload.new_state ?? "—";
      const prevState = payload.previous_state ?? "—";
      return `Execução: ${prevState} → ${newState}`;
    }
    case "EXECUTOR_COMMAND": {
      const cmdType = payload.command_type ?? "UNKNOWN";
      const ok = payload.result_ok ? "OK" : "FALHA";
      return `Executor: ${cmdType} — ${ok}`;
    }
    case "AUDIT_LOG": {
      const action = payload.action ?? "—";
      const resource = payload.resource ?? "—";
      const actor = (payload.actor as Record<string, unknown>)?.user ?? "—";
      return `Audit: ${actor} executou ${action} em ${resource}`;
    }
    case "CONFIG_SNAPSHOT": {
      const reason = payload.reason ?? "—";
      return `Config alterada: ${reason}`;
    }
    case "PROV_STATE_CHANGE": {
      const provider = payload.provider ?? "—";
      const newState = payload.new_state ?? "—";
      return `Provider ${provider}: ${newState}`;
    }
    default: {
      const reasonDesc = getReasonDescription(reasonCode);
      return `${component}: ${eventType}${reasonDesc ? ` — ${reasonDesc}` : ""}`;
    }
  }
}

/**
 * Determina a categoria visual de um evento.
 */
function categorizeEvent(eventType: string): NarrativeTimelineEntry["category"] {
  switch (eventType) {
    case "MCL_SNAPSHOT":
      return "mcl";
    case "BRAIN_INTENT":
      return "brain_action";
    case "BRAIN_SKIP":
      return "brain_skip";
    case "PM_DECISION":
      return "pm_decision";
    case "AUDIT_LOG":
      return "audit";
    default:
      if (eventType.startsWith("EXEC_") || eventType.startsWith("EXECUTOR_")) {
        return "ops_action";
      }
      return "system";
  }
}

// ─── Main Functions ─────────────────────────────────────────────

/**
 * Gera a timeline narrativa a partir de eventos crus.
 */
export function buildNarrativeTimeline(events: LedgerEventRow[]): NarrativeTimelineEntry[] {
  return events
    .sort((a, b) => {
      const ta = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
      const tb = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
      return ta - tb;
    })
    .map((event) => {
      const payload = (typeof event.payload === "string"
        ? JSON.parse(event.payload)
        : event.payload) as Record<string, unknown>;

      return {
        timestamp: toISOString(event.timestamp),
        time: formatTimeBR(event.timestamp),
        component: event.component,
        event_type: event.event_type,
        narrative: generateEventNarrative(
          event.event_type,
          event.component,
          payload,
          event.reason_code,
          event.symbol,
          event.brain_id
        ),
        severity: event.severity,
        reason_code: event.reason_code,
        reason_description: getReasonDescription(event.reason_code),
        symbol: event.symbol,
        brain_id: event.brain_id,
        category: categorizeEvent(event.event_type),
        key_data: extractKeyData(event.event_type, payload),
      };
    });
}

/**
 * Gera explicações de por que cada cérebro atuou ou não.
 */
export function buildBrainExplanations(events: LedgerEventRow[]): BrainSkipExplanation[] {
  const explanations: BrainSkipExplanation[] = [];

  for (const brainId of ALL_BRAIN_IDS) {
    const brainEvents = events.filter(
      (e) => e.brain_id === brainId || e.component === brainId
    );

    const intents = brainEvents.filter((e) => e.event_type === "BRAIN_INTENT");
    const skips = brainEvents.filter((e) => e.event_type === "BRAIN_SKIP");

    if (intents.length > 0) {
      // Cérebro atuou — pegar o último intent
      const lastIntent = intents[intents.length - 1];
      const payload = (typeof lastIntent.payload === "string"
        ? JSON.parse(lastIntent.payload)
        : lastIntent.payload) as Record<string, unknown>;

      explanations.push({
        brain_id: brainId,
        brain_name: BRAIN_NAMES[brainId] ?? brainId,
        acted: true,
        action_type: (payload.intent_type as string) ?? "INTENT",
        symbol: lastIntent.symbol ?? (payload.symbol as string) ?? null,
        skip_reason_code: null,
        skip_explanation: `Cérebro ${brainId} gerou intent: ${payload.intent_type ?? "UNKNOWN"}${lastIntent.symbol ? ` para ${lastIntent.symbol}` : ""}`,
        timestamp: toISOString(lastIntent.timestamp),
      });
    } else if (skips.length > 0) {
      // Cérebro não atuou — pegar o último skip
      const lastSkip = skips[skips.length - 1];
      const payload = (typeof lastSkip.payload === "string"
        ? JSON.parse(lastSkip.payload)
        : lastSkip.payload) as Record<string, unknown>;

      const reasonCode = lastSkip.reason_code ?? (payload.reason_code as string) ?? null;
      const reasonDesc = getReasonDescription(reasonCode);
      const reason = (payload.reason as string) ?? reasonDesc ?? "Motivo não registrado";

      explanations.push({
        brain_id: brainId,
        brain_name: BRAIN_NAMES[brainId] ?? brainId,
        acted: false,
        action_type: null,
        symbol: lastSkip.symbol ?? null,
        skip_reason_code: reasonCode,
        skip_explanation: reason,
        timestamp: toISOString(lastSkip.timestamp),
      });
    } else {
      // Cérebro não foi executado neste dia
      explanations.push({
        brain_id: brainId,
        brain_name: BRAIN_NAMES[brainId] ?? brainId,
        acted: false,
        action_type: null,
        symbol: null,
        skip_reason_code: null,
        skip_explanation: `Cérebro ${brainId} não foi executado neste dia — nenhum evento registrado`,
        timestamp: null,
      });
    }
  }

  return explanations;
}

/**
 * Gera a explicação de "por que não operamos".
 */
export function buildWhyNoTrade(events: LedgerEventRow[]): WhyNoTradeExplanation {
  const brainExplanations = buildBrainExplanations(events);

  // Verificar se houve trade (PM_DECISION com ALLOWED/APPROVED)
  const pmDecisions = events.filter((e) => e.event_type === "PM_DECISION");
  const approvals = pmDecisions.filter((e) => {
    const payload = (typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload) as Record<string, unknown>;
    const dt = String(payload.decision_type ?? "");
    return dt.includes("ALLOWED") || dt.includes("APPROVED");
  });
  const denials = pmDecisions.filter((e) => {
    const payload = (typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload) as Record<string, unknown>;
    const dt = String(payload.decision_type ?? "");
    return dt.includes("DENIED") || dt.includes("REJECTED");
  });

  const hadTrade = approvals.length > 0;

  // PM final decision
  let pmFinalDecision: string | null = null;
  if (pmDecisions.length > 0) {
    const lastPm = pmDecisions[pmDecisions.length - 1];
    const payload = (typeof lastPm.payload === "string" ? JSON.parse(lastPm.payload) : lastPm.payload) as Record<string, unknown>;
    pmFinalDecision = String(payload.decision_type ?? "NO_TRADE");
  } else {
    pmFinalDecision = "NO_TRADE";
  }

  // Coletar reason codes de bloqueio
  const blockingReasonMap = new Map<string, { description: string; component: string; count: number }>();

  // Skips de brains
  const brainSkips = events.filter((e) => e.event_type === "BRAIN_SKIP");
  for (const skip of brainSkips) {
    const rc = skip.reason_code ?? "UNKNOWN";
    const existing = blockingReasonMap.get(rc);
    if (existing) {
      existing.count++;
    } else {
      blockingReasonMap.set(rc, {
        description: getReasonDescription(rc) ?? rc,
        component: skip.component,
        count: 1,
      });
    }
  }

  // PM denials
  for (const denial of denials) {
    const rc = denial.reason_code ?? "PM_POSITION_DENIED";
    const existing = blockingReasonMap.get(rc);
    if (existing) {
      existing.count++;
    } else {
      blockingReasonMap.set(rc, {
        description: getReasonDescription(rc) ?? rc,
        component: denial.component,
        count: 1,
      });
    }
  }

  // EHM blocks
  const ehmActions = events.filter((e) => e.event_type === "EHM_ACTION");
  for (const ehm of ehmActions) {
    const payload = (typeof ehm.payload === "string" ? JSON.parse(ehm.payload) : ehm.payload) as Record<string, unknown>;
    const actionType = String(payload.action_type ?? "");
    if (actionType.includes("BLOCK") || actionType.includes("COOLDOWN") || actionType.includes("KILL")) {
      const rc = ehm.reason_code ?? "EHM_REDUCE_RISK";
      const existing = blockingReasonMap.get(rc);
      if (existing) {
        existing.count++;
      } else {
        blockingReasonMap.set(rc, {
          description: getReasonDescription(rc) ?? rc,
          component: ehm.component,
          count: 1,
        });
      }
    }
  }

  const blockingReasons = Array.from(blockingReasonMap.entries()).map(([rc, data]) => ({
    reason_code: rc,
    description: data.description,
    component: data.component,
    count: data.count,
  }));

  // Gerar resumo narrativo
  let summary: string;
  if (hadTrade) {
    summary = `O sistema executou ${approvals.length} operação(ões) neste dia. ${denials.length > 0 ? `${denials.length} intent(s) foram negados pelo PM.` : ""}`;
  } else if (brainSkips.length > 0 && pmDecisions.length === 0) {
    const skipBrains = brainExplanations.filter((b) => !b.acted).map((b) => b.brain_id);
    summary = `Nenhum cérebro encontrou edge suficiente para operar. ${skipBrains.join(", ")} não geraram intents. ${blockingReasons.length > 0 ? `Motivos: ${blockingReasons.map((r) => r.description).join("; ")}.` : ""}`;
  } else if (pmDecisions.length > 0 && denials.length > 0 && approvals.length === 0) {
    summary = `Cérebros geraram intents, mas o PM negou todas as operações. Motivos: ${denials.map((d) => getReasonDescription(d.reason_code) ?? d.reason_code ?? "—").join("; ")}.`;
  } else if (events.length === 0) {
    summary = "Nenhum evento registrado neste dia. O sistema pode não ter sido executado (tick não rodou).";
  } else {
    const activeBrains = brainExplanations.filter((b) => b.acted).map((b) => b.brain_id);
    const inactiveBrains = brainExplanations.filter((b) => !b.acted).map((b) => b.brain_id);
    summary = `Dia com ${events.length} eventos. ${activeBrains.length > 0 ? `Cérebros ativos: ${activeBrains.join(", ")}.` : "Nenhum cérebro ativo."} ${inactiveBrains.length > 0 ? `Inativos: ${inactiveBrains.join(", ")}.` : ""} Decisão final do PM: ${pmFinalDecision}.`;
  }

  return {
    had_trade: hadTrade,
    summary,
    brain_explanations: brainExplanations,
    pm_final_decision: pmFinalDecision,
    blocking_reasons: blockingReasons,
  };
}

/**
 * Gera o resumo narrativo completo do dia.
 */
export function buildDaySummary(
  date: string,
  events: LedgerEventRow[],
  auditLogs: AuditLogRow[]
): DayNarrativeSummary {
  const mclSnapshots = events.filter((e) => e.event_type === "MCL_SNAPSHOT");
  const brainIntents = events.filter((e) => e.event_type === "BRAIN_INTENT");
  const brainSkips = events.filter((e) => e.event_type === "BRAIN_SKIP");
  const pmDecisions = events.filter((e) => e.event_type === "PM_DECISION");
  const errors = events.filter((e) => e.severity === "ERROR");
  const warnings = events.filter((e) => e.severity === "WARN");

  // PM approvals/denials
  const pmApprovals = pmDecisions.filter((e) => {
    const payload = (typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload) as Record<string, unknown>;
    const dt = String(payload.decision_type ?? "");
    return dt.includes("ALLOWED") || dt.includes("APPROVED");
  });
  const pmDenials = pmDecisions.filter((e) => {
    const payload = (typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload) as Record<string, unknown>;
    const dt = String(payload.decision_type ?? "");
    return dt.includes("DENIED") || dt.includes("REJECTED");
  });

  // Ops actions (ARM, DISARM, KILL)
  const opsActions = events.filter((e) =>
    e.event_type === "AUDIT_LOG" || e.event_type === "EXEC_STATE_CHANGE"
  );

  // Cérebros ativos/inativos
  const brainExplanations = buildBrainExplanations(events);
  const activeBrains = brainExplanations.filter((b) => b.acted).map((b) => b.brain_id);
  const inactiveBrains = brainExplanations.filter((b) => !b.acted).map((b) => b.brain_id);

  // Símbolos envolvidos
  const symbolSet = new Set<string>();
  events.forEach((e) => {
    if (e.symbol) symbolSet.add(e.symbol);
  });
  const symbolsInvolved = Array.from(symbolSet);

  // Determinar outcome
  let outcome: DayNarrativeSummary["outcome"];
  let outcomeExplanation: string;

  if (events.length === 0) {
    outcome = "EMPTY";
    outcomeExplanation = "Nenhum evento registrado. O sistema não foi executado neste dia.";
  } else if (errors.length > 0 && mclSnapshots.length === 0) {
    outcome = "ERROR";
    outcomeExplanation = `Dia com ${errors.length} erro(s) e sem MCL snapshots. Pipeline pode não ter executado corretamente.`;
  } else if (pmApprovals.length > 0) {
    outcome = "TRADE_EXECUTED";
    outcomeExplanation = `${pmApprovals.length} operação(ões) aprovada(s) pelo PM. ${pmDenials.length > 0 ? `${pmDenials.length} negada(s).` : ""}`;
  } else if (brainIntents.length > 0 && pmDenials.length > 0) {
    outcome = "NO_TRADE";
    outcomeExplanation = `Cérebros geraram ${brainIntents.length} intent(s), mas PM negou todas as operações.`;
  } else if (brainSkips.length > 0 || mclSnapshots.length > 0) {
    outcome = "NO_TRADE";
    outcomeExplanation = "Nenhum cérebro encontrou edge suficiente para operar. Pipeline executou normalmente.";
  } else {
    outcome = "PARTIAL";
    outcomeExplanation = "Dia com execução parcial — nem todos os componentes do pipeline geraram eventos.";
  }

  // Gerar título narrativo
  let title: string;
  switch (outcome) {
    case "TRADE_EXECUTED":
      title = `Dia operacional — ${pmApprovals.length} trade(s) executado(s)`;
      break;
    case "NO_TRADE":
      title = "Dia sem operação — pipeline executou mas sem edge";
      break;
    case "ERROR":
      title = "Dia com erros — verificar pipeline";
      break;
    case "EMPTY":
      title = "Dia vazio — sistema não executou";
      break;
    case "PARTIAL":
      title = "Dia parcial — execução incompleta";
      break;
  }

  // Gerar resumo narrativo
  const summaryParts: string[] = [];
  if (mclSnapshots.length > 0) {
    summaryParts.push(`${mclSnapshots.length} snapshot(s) de mercado capturado(s)`);
  }
  if (activeBrains.length > 0) {
    summaryParts.push(`Cérebros ativos: ${activeBrains.join(", ")}`);
  }
  if (inactiveBrains.length > 0) {
    summaryParts.push(`Cérebros inativos: ${inactiveBrains.join(", ")}`);
  }
  if (pmDecisions.length > 0) {
    summaryParts.push(`${pmDecisions.length} decisão(ões) do PM (${pmApprovals.length} aprovada(s), ${pmDenials.length} negada(s))`);
  }
  if (errors.length > 0) {
    summaryParts.push(`${errors.length} erro(s) registrado(s)`);
  }
  if (auditLogs.length > 0) {
    summaryParts.push(`${auditLogs.length} ação(ões) de auditoria`);
  }

  const summaryText = summaryParts.length > 0
    ? summaryParts.join(". ") + "."
    : "Sem dados suficientes para gerar resumo.";

  // Verificar se o dia foi encerrado corretamente
  // Um dia é "encerrado corretamente" se teve MCL snapshot e pelo menos brain skip/intent
  const dayClosedCorrectly = mclSnapshots.length > 0 && (brainIntents.length > 0 || brainSkips.length > 0);

  return {
    date,
    title,
    summary: summaryText,
    outcome,
    outcome_explanation: outcomeExplanation,
    stats: {
      total_events: events.length,
      mcl_snapshots: mclSnapshots.length,
      brain_intents: brainIntents.length,
      brain_skips: brainSkips.length,
      pm_decisions: pmDecisions.length,
      pm_approvals: pmApprovals.length,
      pm_denials: pmDenials.length,
      ops_actions: opsActions.length,
      audit_logs: auditLogs.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    active_brains: activeBrains,
    inactive_brains: inactiveBrains,
    symbols_involved: symbolsInvolved,
    day_closed_correctly: dayClosedCorrectly,
  };
}

/**
 * Gera a narrativa completa de um dia de replay.
 * Esta é a função principal chamada pelo endpoint.
 */
export function buildReplayDayNarrative(
  date: string,
  events: LedgerEventRow[],
  auditLogs: AuditLogRow[]
): ReplayDayNarrative {
  const timeline = buildNarrativeTimeline(events);
  const summary = buildDaySummary(date, events, auditLogs);
  const whyNoTrade = buildWhyNoTrade(events);
  const brainExplanations = buildBrainExplanations(events);

  return {
    date,
    summary,
    timeline,
    why_no_trade: whyNoTrade,
    brain_explanations: brainExplanations,
  };
}
