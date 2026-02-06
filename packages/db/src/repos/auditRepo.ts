// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/db — Audit Repository
// ═══════════════════════════════════════════════════════════════
// Funções de acesso a dados para a tabela audit_logs.
// Registra mudanças de configuração e ações humanas/sistema.
// ═══════════════════════════════════════════════════════════════

import { getPool } from "../connection";
import type {
  AuditLogRow,
  AuditLogInput,
  AuditLogFilters,
  TimeRange,
} from "../schema/tables";

// ─── Repository ─────────────────────────────────────────────────

/**
 * Insere um registro de auditoria.
 * Não é idempotente por design — cada ação gera um audit_id único.
 */
export async function insertAuditLog(entry: AuditLogInput): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO audit_logs
       (audit_id, timestamp, actor_user_id, actor_role, action,
        resource, reason, before, after, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.audit_id,
      entry.timestamp,
      entry.actor_user_id,
      entry.actor_role,
      entry.action,
      entry.resource,
      entry.reason,
      entry.before ? JSON.stringify(entry.before) : null,
      entry.after ? JSON.stringify(entry.after) : null,
      entry.correlation_id ?? null,
    ]
  );
}

/**
 * Lista registros de auditoria por range temporal com filtros opcionais.
 * Ordenados por timestamp DESC (mais recentes primeiro).
 */
export async function listAuditLogs(
  timeRange: TimeRange,
  filters: AuditLogFilters = {},
  limit = 200,
  offset = 0
): Promise<AuditLogRow[]> {
  const pool = getPool();

  const whereParts: string[] = [
    `timestamp >= $1`,
    `timestamp <= $2`,
  ];
  const params: unknown[] = [timeRange.start, timeRange.end];
  let idx = 3;

  if (filters.resource !== undefined) {
    whereParts.push(`resource = $${idx}`);
    params.push(filters.resource);
    idx++;
  }
  if (filters.actor_user_id !== undefined) {
    whereParts.push(`actor_user_id = $${idx}`);
    params.push(filters.actor_user_id);
    idx++;
  }

  params.push(limit, offset);

  const query = `
    SELECT * FROM audit_logs
    WHERE ${whereParts.join(" AND ")}
    ORDER BY timestamp DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  const result = await pool.query<AuditLogRow>(query, params);
  return result.rows;
}
