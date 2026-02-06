// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/db — Schema / Tipos das tabelas PostgreSQL
// ═══════════════════════════════════════════════════════════════
// Estes tipos refletem 1:1 as tabelas criadas nas migrations.
// Não usam ORM — servem apenas como tipagem para o DAL.
// ═══════════════════════════════════════════════════════════════

// ─── Severidade (espelha contracts/base/severity) ───────────────
export type Severity = "INFO" | "WARN" | "ERROR";

// ─── Componentes do sistema ─────────────────────────────────────
export type Component =
  | "MCL"
  | "PM"
  | "A2"
  | "B3"
  | "C3"
  | "D2"
  | "EHM"
  | "SYSTEM";

// ─── Ações de auditoria (espelha contracts/schemas/audit-log) ───
export type AuditAction =
  | "CONFIG_CHANGE"
  | "PARAM_UPDATE"
  | "BRAIN_TOGGLE"
  | "MODE_OVERRIDE"
  | "MANUAL_ACTION"
  | "SYSTEM_RESTART"
  | "PERMISSION_CHANGE";

// ─── Status de replay day ───────────────────────────────────────
export type ReplayDayStatus = "complete" | "partial";

// ═══════════════════════════════════════════════════════════════
// Tipos das linhas (rows) — representam o que sai do PostgreSQL
// ═══════════════════════════════════════════════════════════════

/**
 * Linha da tabela `ledger_events`.
 * Armazena todos os eventos estruturados do sistema.
 * O campo `payload` contém o JSON completo conforme contracts.
 */
export interface LedgerEventRow {
  /** UUID v4 — identificador único do evento (PK, idempotência) */
  event_id: string;
  /** UUID v4 — cadeia de correlação */
  correlation_id: string;
  /** ISO 8601 timestamptz */
  timestamp: Date;
  /** INFO | WARN | ERROR */
  severity: Severity;
  /** Tipo do evento (ex: MCL_SNAPSHOT, BRAIN_INTENT, PM_DECISION, EHM_ACTION, EXEC_STATE_CHANGE, PROV_STATE_CHANGE) */
  event_type: string;
  /** Componente emissor */
  component: Component;
  /** Símbolo do ativo (nullable) */
  symbol: string | null;
  /** Brain ID (nullable) */
  brain_id: string | null;
  /** Código de razão do catálogo central (nullable) */
  reason_code: string | null;
  /** JSON completo do evento conforme contracts */
  payload: Record<string, unknown>;
}

/**
 * Input para inserção de um evento no ledger.
 * Idêntico a LedgerEventRow mas com timestamp como string ISO.
 */
export interface LedgerEventInput {
  event_id: string;
  correlation_id: string;
  timestamp: string;
  severity: Severity;
  event_type: string;
  component: Component;
  symbol?: string | null;
  brain_id?: string | null;
  reason_code?: string | null;
  payload: Record<string, unknown>;
}

/**
 * Linha da tabela `audit_logs`.
 * Registra mudanças de configuração e ações humanas/sistema.
 */
export interface AuditLogRow {
  /** UUID v4 — identificador único do audit log (PK) */
  audit_id: string;
  /** ISO 8601 timestamptz */
  timestamp: Date;
  /** Identificador do ator (user_id, email ou "system") */
  actor_user_id: string;
  /** Papel do ator (admin, operator, system) */
  actor_role: string;
  /** Tipo de ação */
  action: AuditAction;
  /** Recurso afetado (ex: brain.A2, config.risk_limits) */
  resource: string;
  /** Motivo humano para a ação */
  reason: string;
  /** Estado anterior do recurso (nullable) */
  before: Record<string, unknown> | null;
  /** Estado posterior do recurso (nullable) */
  after: Record<string, unknown> | null;
  /** UUID v4 — correlação opcional */
  correlation_id: string | null;
}

/**
 * Input para inserção de um audit log.
 */
export interface AuditLogInput {
  audit_id: string;
  timestamp: string;
  actor_user_id: string;
  actor_role: string;
  action: AuditAction;
  resource: string;
  reason: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  correlation_id?: string | null;
}

/**
 * Linha da tabela `replay_days`.
 * Cache/registro de dias disponíveis para replay e export.
 */
export interface ReplayDayRow {
  /** Data do dia (PK) */
  date: string;
  /** Quando o registro foi criado */
  created_at: Date;
  /** complete | partial */
  status: ReplayDayStatus;
  /** Resumo agregado: PnL, DD, alerts (preenchido pela API) */
  summary: Record<string, unknown> | null;
}

/**
 * Input para upsert de um replay day.
 */
export interface ReplayDayInput {
  date: string;
  status: ReplayDayStatus;
  summary?: Record<string, unknown> | null;
}

// ═══════════════════════════════════════════════════════════════
// Filtros para queries
// ═══════════════════════════════════════════════════════════════

/**
 * Filtros opcionais para listagem de ledger events.
 */
export interface LedgerEventFilters {
  symbol?: string;
  brain_id?: string;
  severity?: Severity;
  event_type?: string;
  reason_code?: string;
}

/**
 * Filtros opcionais para listagem de audit logs.
 */
export interface AuditLogFilters {
  resource?: string;
  actor_user_id?: string;
}

/**
 * Filtros para busca de logs (searchLogs).
 */
export interface SearchLogsFilters {
  reason_code?: string;
  event_type?: string;
  symbol?: string;
}

/**
 * Range temporal para queries.
 */
export interface TimeRange {
  start: string;
  end: string;
}
