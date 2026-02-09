// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Executor Service
// ═══════════════════════════════════════════════════════════════
// Camada de serviço para integração com o executor.
// Escolhe entre adapter real e simulador via env:
//   EXECUTOR_MODE=SIMULATOR|REAL (default: SIMULATOR)
//
// Funções:
//   getExecutorStatus()  — obtém status do executor
//   applyCommands()      — envia batch de comandos com logging
//   handleExecutorEvent() — processa evento webhook do executor
//   getAdapter()          — acesso direto ao adapter (para testes)
// ═══════════════════════════════════════════════════════════════

import {
  ExecutorAdapter,
  ExecutorSimulator,
} from "@schimidt-brain/adapters";
import type {
  IExecutorAdapter,
  ExecutorStatus,
  ExecutorCommand,
  ExecutorCommandResult,
  ExecutorEvent,
} from "@schimidt-brain/adapters";
import { persistEvent } from "./ledgerService";
import { publishLedgerEvent } from "./streamService";
import { newEventId, newCorrelationId, nowISO } from "../utils/correlation";
import {
  setExecutionState,
  setExecutorConnectivity,
} from "../config/gates";

// ─── Singleton do Adapter ──────────────────────────────────────

let _adapter: IExecutorAdapter | null = null;

/**
 * Retorna o adapter configurado (real ou simulador).
 * Singleton — criado na primeira chamada.
 * 
 * CORREÇÃO: Registra callback para receber eventos de lifecycle
 * do simulator e persistí-los no ledger.
 */
export function getAdapter(): IExecutorAdapter {
  if (!_adapter) {
    const mode = (process.env.EXECUTOR_MODE ?? "SIMULATOR").toUpperCase();
    if (mode === "REAL") {
      _adapter = new ExecutorAdapter();
    } else {
      const simulator = new ExecutorSimulator("normal");
      
      // CORREÇÃO CRÍTICA: Registrar callback para persistir lifecycle events
      simulator.onLifecycleEvents(async (events) => {
        for (const event of events) {
          await handleExecutorEvent(event);
        }
      });
      
      _adapter = simulator;
    }
  }
  return _adapter;
}

/**
 * Permite injetar um adapter customizado (para testes).
 */
export function setAdapter(adapter: IExecutorAdapter): void {
  _adapter = adapter;
}

// ─── Thresholds de Safety ──────────────────────────────────────

/** Latência acima deste valor = DEGRADED */
const LATENCY_DEGRADED_MS = 500;

/** Latência acima deste valor = BROKEN */
const LATENCY_BROKEN_MS = 2000;

/** Error rate acima deste valor = DEGRADED */
const ERROR_RATE_DEGRADED = 0.2;

/** Error rate acima deste valor = BROKEN */
const ERROR_RATE_BROKEN = 0.5;

// ─── Funções Públicas ──────────────────────────────────────────

/**
 * Resultado de um batch de comandos.
 */
export interface ApplyCommandsResult {
  /** Total de comandos enviados */
  total: number;
  /** Comandos que tiveram sucesso */
  succeeded: number;
  /** Comandos que falharam */
  failed: number;
  /** Resultados individuais */
  results: Array<{
    command: ExecutorCommand;
    result: ExecutorCommandResult;
  }>;
}

/**
 * Obtém o status do executor e atualiza o estado operacional.
 * Em caso de falha, atualiza connectivity para "disconnected".
 */
export async function getExecutorStatus(): Promise<ExecutorStatus | null> {
  const adapter = getAdapter();

  try {
    const status = await adapter.getStatus();

    // Atualizar estado operacional
    setExecutorConnectivity(status.connected ? "connected" : "disconnected");

    // Avaliar saúde e atualizar execution_state
    const derivedState = deriveExecutionState(status);
    setExecutionState(derivedState);

    return status;
  } catch (err) {
    // Executor down ou inacessível
    setExecutorConnectivity("disconnected");
    setExecutionState("BROKEN");

    // Registrar no ledger
    await persistSafetyEvent(
      "BROKEN",
      err instanceof Error ? err.message : String(err),
      (err as Record<string, string>).reason_code ?? "EXEC_BROKEN"
    );

    return null;
  }
}

/**
 * Envia um batch de comandos ao executor com logging individual.
 * Cada comando é enviado sequencialmente e o resultado é registrado.
 *
 * @param commands - Lista de comandos a enviar
 * @param correlationId - ID de correlação para rastreamento
 * @returns Resultado agregado do batch
 */
export async function applyCommands(
  commands: ExecutorCommand[],
  correlationId?: string
): Promise<ApplyCommandsResult> {
  const adapter = getAdapter();
  const corrId = correlationId ?? newCorrelationId();
  const results: ApplyCommandsResult["results"] = [];
  let succeeded = 0;
  let failed = 0;

  for (const cmd of commands) {
    // CORREÇÃO: Incluir correlation_id no comando para rastreabilidade
    const cmdWithCorrelation: ExecutorCommand = {
      ...cmd,
      correlation_id: corrId,
    };

    let result: ExecutorCommandResult;

    try {
      result = await adapter.sendCommand(cmdWithCorrelation);
    } catch (err) {
      result = {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        reason_code: "EXEC_ORDER_FAILED",
      };
    }

    if (result.ok) {
      succeeded++;
    } else {
      failed++;
    }

    results.push({ command: cmd, result });

    // Registrar no ledger
    try {
      await persistEvent({
        event_id: newEventId(),
        correlation_id: corrId,
        timestamp: nowISO(),
        severity: result.ok ? "INFO" : "WARN",
        event_type: "EXECUTOR_COMMAND",
        component: "SYSTEM",
        symbol: null,
        brain_id: null,
        reason_code: result.reason_code ?? (result.ok ? "EXEC_STATE_CHANGE" : "EXEC_ORDER_FAILED"),
        payload: {
          command_type: cmd.type,
          command_payload: cmd.payload,
          result_ok: result.ok,
          result_message: result.message ?? null,
          result_reason_code: result.reason_code ?? null,
        },
      });
    } catch (logErr) {
      // Não falhar o batch por erro de logging
      console.error("Erro ao registrar comando no ledger:", logErr);
    }
  }

  // Se houve falhas, verificar se precisa entrar em safety mode
  if (failed > 0 && failed === commands.length) {
    // Todos os comandos falharam — possível executor down
    setExecutionState("BROKEN");
    await persistSafetyEvent(
      "BROKEN",
      `Todos os ${failed} comandos falharam`,
      "EXEC_BROKEN"
    );
  } else if (failed > 0) {
    // Falhas parciais — degradado
    setExecutionState("DEGRADED");
    await persistSafetyEvent(
      "DEGRADED",
      `${failed}/${commands.length} comandos falharam`,
      "EXEC_DEGRADED"
    );
  }

  return { total: commands.length, succeeded, failed, results };
}

/**
 * Processa um evento recebido do executor via webhook.
 * Persiste no ledger e emite SSE.
 *
 * @param event - Evento do executor
 */
export async function handleExecutorEvent(event: ExecutorEvent): Promise<void> {
  const eventId = newEventId();
  // CORREÇÃO CRÍTICA: Preservar correlation_id do evento original
  const correlationId = event.correlation_id ?? newCorrelationId();
  const timestamp = nowISO();

  // Determinar severidade baseada no tipo de evento
  const severity = event.type === "ERROR" ? "ERROR" : "INFO";

  // CORREÇÃO 1: Normalizar eventos de execução
  // Se o evento contém details.event_type (EXEC_SIMULATED_FILL, etc.),
  // criar evento explícito ao invés de apenas wrapper EXECUTOR_EVENT
  const details = event.details as Record<string, unknown> | undefined;
  const execEventType = details?.event_type as string | undefined;

  // Tipos de eventos que devem ser normalizados
  const normalizedEventTypes = [
    "EXEC_SIMULATED_FILL",
    "EXEC_POSITION_OPENED",
    "EXEC_POSITION_CLOSED",
    "EXEC_POSITION_UPDATED",
    "EXEC_PNL_UPDATE",
    "EXEC_DAY_SUMMARY",
  ];

  let eventType = "EXECUTOR_EVENT";
  let reasonCode = event.type === "ERROR" ? "EXEC_ORDER_FAILED" : "EXEC_STATE_CHANGE";

  if (execEventType && normalizedEventTypes.includes(execEventType)) {
    // Criar evento explícito
    eventType = execEventType;
    reasonCode = execEventType;
  }

  // Persistir no ledger
  const ledgerEvent = {
    event_id: eventId,
    correlation_id: correlationId,
    timestamp,
    severity: severity as "INFO" | "WARN" | "ERROR",
    event_type: eventType,
    component: "SYSTEM" as const,
    symbol: event.symbol || null,
    brain_id: null,
    reason_code: reasonCode,
    payload: {
      executor_event_type: event.type,
      symbol: event.symbol,
      strategy: event.strategy,
      details: event.details,
      executor_timestamp: event.timestamp,
    },
  };

  try {
    await persistEvent(ledgerEvent);
  } catch (err) {
    // Se persistência falhar, pelo menos emitir SSE
    console.error("Erro ao persistir evento do executor:", err);
    publishLedgerEvent(ledgerEvent);
  }
}

// ─── Helpers Internos ──────────────────────────────────────────

/**
 * Deriva o estado de execução a partir do status do executor.
 */
function deriveExecutionState(status: ExecutorStatus): string {
  // Se o executor já reporta execution_state, usar
  if (status.health.execution_state) {
    return status.health.execution_state;
  }

  // Derivar a partir de métricas
  if (
    status.health.latency_ms > LATENCY_BROKEN_MS ||
    status.health.error_rate > ERROR_RATE_BROKEN
  ) {
    return "BROKEN";
  }

  if (
    status.health.latency_ms > LATENCY_DEGRADED_MS ||
    status.health.error_rate > ERROR_RATE_DEGRADED
  ) {
    return "DEGRADED";
  }

  return "OK";
}

/**
 * Persiste um evento de safety (mudança de estado de execução) no ledger.
 */
async function persistSafetyEvent(
  newState: string,
  message: string,
  reasonCode: string
): Promise<void> {
  try {
    const eventId = newEventId();
    const correlationId = newCorrelationId();

    await persistEvent({
      event_id: eventId,
      correlation_id: correlationId,
      timestamp: nowISO(),
      severity: newState === "BROKEN" ? "ERROR" : "WARN",
      event_type: "EXEC_STATE_CHANGE",
      component: "SYSTEM",
      symbol: null,
      brain_id: null,
      reason_code: reasonCode,
      payload: {
        event_id: eventId,
        correlation_id: correlationId,
        timestamp: nowISO(),
        severity: newState === "BROKEN" ? "ERROR" : "WARN",
        previous_state: "OK",
        new_state: newState,
        why: {
          reason_code: reasonCode,
          message,
        },
      },
    });
  } catch (err) {
    console.error("Erro ao persistir evento de safety:", err);
  }
}
