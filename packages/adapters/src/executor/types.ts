// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Executor Types (Brain-Side Contract)
// ═══════════════════════════════════════════════════════════════
// Contrato definido pelo Brain para comunicação com o Executor.
// O executor real deve se alinhar a estes tipos no futuro.
// Versão do contrato: 1.0.0
// ═══════════════════════════════════════════════════════════════

// ─── Executor Status ──────────────────────────────────────────

/**
 * Estado de saúde da execução derivado no Brain.
 * Mapeado para ExecutionHealth do contracts quando necessário.
 */
export type ExecutionState = "OK" | "DEGRADED" | "BROKEN";

/**
 * Perfil de risco ativo no executor.
 */
export interface ExecutorRiskProfile {
  /** Risco máximo por operação em percentual */
  max_risk_per_trade_pct: number;
  /** Perda diária máxima em percentual */
  max_daily_loss_pct: number;
  /** Número máximo de posições simultâneas */
  max_positions: number;
}

/**
 * Métricas de saúde do executor.
 */
export interface ExecutorHealthMetrics {
  /** Latência da última comunicação em ms */
  latency_ms: number;
  /** Taxa de erro recente (0–1) */
  error_rate: number;
  /** Estado derivado pelo Brain */
  execution_state: ExecutionState;
}

/**
 * Status completo do executor conforme reportado ao Brain.
 */
export interface ExecutorStatus {
  /** Se o executor está conectado e respondendo */
  connected: boolean;
  /** Timestamp ISO 8601 da última verificação */
  timestamp: string;
  /** Modo do executor (ex: ICMARKETS, DERIV) */
  mode: string;
  /** Estratégia ativa no momento */
  active_strategy: string;
  /** Símbolos ativos para trading */
  active_symbols: string[];
  /** Perfil de risco ativo */
  risk_profile: ExecutorRiskProfile;
  /** Métricas de saúde */
  health: ExecutorHealthMetrics;
}

// ─── Executor Command ─────────────────────────────────────────

/**
 * Tipos de comando que o Brain pode enviar ao executor.
 */
export type ExecutorCommandType =
  | "ARM"
  | "DISARM"
  | "SET_STRATEGY"
  | "SET_PARAMS"
  | "SET_RISK"
  | "CLOSE_DAY"
  | "SET_SYMBOLS_ACTIVE";

/**
 * Comando enviado do Brain para o executor.
 */
export interface ExecutorCommand {
  /** Tipo do comando */
  type: ExecutorCommandType;
  /** Payload específico do comando (JSON) */
  payload: Record<string, unknown>;
  /** Correlation ID do tick que originou este comando (para rastreabilidade) */
  correlation_id?: string;
}

/**
 * Resposta do executor a um comando.
 */
export interface ExecutorCommandResult {
  /** Se o comando foi aceite com sucesso */
  ok: boolean;
  /** Mensagem descritiva (erro ou confirmação) */
  message?: string;
  /** Código de razão para logging no ledger */
  reason_code?: string;
}

// ─── Executor Event (Webhook) ─────────────────────────────────

/**
 * Tipos de evento que o executor pode enviar ao Brain via webhook.
 */
export type ExecutorEventType =
  | "ORDER_FILLED"
  | "SL_HIT"
  | "TP_HIT"
  | "ERROR"
  | "INFO";

/**
 * Evento recebido do executor via webhook.
 */
export interface ExecutorEvent {
  /** Tipo do evento */
  type: ExecutorEventType;
  /** Símbolo do ativo */
  symbol: string;
  /** Estratégia que gerou o evento */
  strategy: string;
  /** Detalhes adicionais (JSON) */
  details: Record<string, unknown>;
  /** Timestamp ISO 8601 do evento no executor */
  timestamp: string;
  /** Correlation ID do comando original (para manter rastreabilidade) */
  correlation_id?: string;
}

// ─── Executor Adapter Interface ───────────────────────────────

/**
 * Interface que tanto o adapter real quanto o simulador implementam.
 * Permite troca transparente entre real e simulado.
 */
export interface IExecutorAdapter {
  /** Obtém o status atual do executor */
  getStatus(): Promise<ExecutorStatus>;
  /** Envia um comando ao executor */
  sendCommand(cmd: ExecutorCommand): Promise<ExecutorCommandResult>;
}

// ─── Simulator Mode ───────────────────────────────────────────

/**
 * Modos de operação do simulador.
 */
export type SimulatorMode = "normal" | "degraded" | "down";
