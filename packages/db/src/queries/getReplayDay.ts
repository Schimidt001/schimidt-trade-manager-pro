// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/db — Query: getReplayDay
// ═══════════════════════════════════════════════════════════════
// Query dedicada para obter o detalhe completo de um dia de replay.
// Retorna eventos agrupados por componente e estatísticas.
// ═══════════════════════════════════════════════════════════════

import { getPool } from "../connection";
import type {
  LedgerEventRow,
  AuditLogRow,
  ReplayDayStatus,
} from "../schema/tables";

/**
 * Estatísticas de um dia de replay.
 */
export interface ReplayDayStats {
  total_events: number;
  events_by_component: Record<string, number>;
  events_by_severity: Record<string, number>;
  events_by_type: Record<string, number>;
  audit_log_count: number;
}

/**
 * Resultado completo e enriquecido de um dia de replay.
 */
export interface ReplayDayFull {
  date: string;
  status: ReplayDayStatus;
  summary: Record<string, unknown> | null;
  stats: ReplayDayStats;
  events: LedgerEventRow[];
  auditLogs: AuditLogRow[];
}

/**
 * Obtém o detalhe completo de um dia de replay com estatísticas.
 * Retorna null se o dia não existe em replay_days.
 *
 * @param date - Data no formato YYYY-MM-DD
 */
export async function getReplayDayFull(date: string): Promise<ReplayDayFull | null> {
  const pool = getPool();

  // 1. Verificar se o dia existe
  const dayResult = await pool.query(
    `SELECT date::text AS date, status, summary FROM replay_days WHERE date = $1`,
    [date]
  );

  if (dayResult.rows.length === 0) {
    return null;
  }

  const day = dayResult.rows[0];
  const dayStart = `${date}T00:00:00Z`;
  const dayEnd = `${date}T23:59:59.999999Z`;

  // 2. Buscar eventos do dia
  const eventsResult = await pool.query<LedgerEventRow>(
    `SELECT * FROM ledger_events
     WHERE timestamp >= $1 AND timestamp <= $2
     ORDER BY timestamp ASC`,
    [dayStart, dayEnd]
  );

  // 3. Buscar audit logs do dia
  const auditsResult = await pool.query<AuditLogRow>(
    `SELECT * FROM audit_logs
     WHERE timestamp >= $1 AND timestamp <= $2
     ORDER BY timestamp ASC`,
    [dayStart, dayEnd]
  );

  // 4. Calcular estatísticas a partir dos eventos já carregados
  const events = eventsResult.rows;
  const componentCounts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};

  for (const e of events) {
    componentCounts[e.component] = (componentCounts[e.component] || 0) + 1;
    severityCounts[e.severity] = (severityCounts[e.severity] || 0) + 1;
    typeCounts[e.event_type] = (typeCounts[e.event_type] || 0) + 1;
  }

  const stats: ReplayDayStats = {
    total_events: events.length,
    events_by_component: componentCounts,
    events_by_severity: severityCounts,
    events_by_type: typeCounts,
    audit_log_count: auditsResult.rows.length,
  };

  return {
    date: String(day.date),
    status: day.status,
    summary: day.summary,
    stats,
    events,
    auditLogs: auditsResult.rows,
  };
}
