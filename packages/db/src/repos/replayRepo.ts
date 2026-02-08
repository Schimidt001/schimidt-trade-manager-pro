// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/db — Replay Repository
// ═══════════════════════════════════════════════════════════════
// Funções de acesso a dados para a tabela replay_days.
// Gerencia cache de dias disponíveis para replay e export.
// ═══════════════════════════════════════════════════════════════

import { getPool } from "../connection";
import type {
  ReplayDayRow,
  ReplayDayInput,
  ReplayDayStatus,
  LedgerEventRow,
  AuditLogRow,
} from "../schema/tables";

// ─── Types ──────────────────────────────────────────────────────

/**
 * Resultado completo de um dia de replay.
 * Inclui todos os ledger events e audit logs do dia.
 */
export interface ReplayDayDetail {
  date: string;
  status: ReplayDayStatus;
  summary: Record<string, unknown> | null;
  events: LedgerEventRow[];
  auditLogs: AuditLogRow[];
}

// ─── Repository ─────────────────────────────────────────────────

/**
 * Insere ou atualiza um dia de replay.
 * Upsert: se o dia já existe, atualiza status e summary.
 */
export async function upsertReplayDay(input: ReplayDayInput): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO replay_days (date, status, summary)
     VALUES ($1, $2, $3)
     ON CONFLICT (date) DO UPDATE SET
       status = EXCLUDED.status,
       summary = COALESCE(EXCLUDED.summary, replay_days.summary)`,
    [
      input.date,
      input.status,
      input.summary ? JSON.stringify(input.summary) : null,
    ]
  );
}

/**
 * Lista dias de replay disponíveis.
 * Ordenados por data DESC (mais recentes primeiro).
 * Filtro opcional por status.
 */
export async function listReplayDays(
  limit = 90,
  status?: ReplayDayStatus
): Promise<ReplayDayRow[]> {
  const pool = getPool();

  if (status !== undefined) {
    const result = await pool.query<ReplayDayRow>(
      `SELECT date::text AS date, status, summary, created_at FROM replay_days
       WHERE status = $1
       ORDER BY date DESC
       LIMIT $2`,
      [status, limit]
    );
    return result.rows;
  }

  const result = await pool.query<ReplayDayRow>(
    `SELECT date::text AS date, status, summary, created_at FROM replay_days
     ORDER BY date DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Retorna o detalhe completo de um dia de replay:
 * - Metadados do dia (status, summary)
 * - Todos os ledger_events do dia (00:00:00 a 23:59:59.999999 UTC)
 * - Todos os audit_logs do dia
 *
 * Retorna null se o dia não existe em replay_days.
 */
export async function getReplayDay(date: string): Promise<ReplayDayDetail | null> {
  const pool = getPool();

  // 1. Buscar metadados do dia
  const dayResult = await pool.query<ReplayDayRow>(
    `SELECT date::text AS date, status, summary, created_at FROM replay_days WHERE date = $1`,
    [date]
  );

  if (dayResult.rows.length === 0) {
    return null;
  }

  const day = dayResult.rows[0];

  // 2. Buscar todos os ledger events do dia (UTC)
  const dayStart = `${date}T00:00:00Z`;
  const dayEnd = `${date}T23:59:59.999999Z`;

  const eventsResult = await pool.query<LedgerEventRow>(
    `SELECT * FROM ledger_events
     WHERE timestamp >= $1 AND timestamp <= $2
     ORDER BY timestamp ASC`,
    [dayStart, dayEnd]
  );

  // 3. Buscar todos os audit logs do dia (UTC)
  const auditsResult = await pool.query<AuditLogRow>(
    `SELECT * FROM audit_logs
     WHERE timestamp >= $1 AND timestamp <= $2
     ORDER BY timestamp ASC`,
    [dayStart, dayEnd]
  );

  return {
    date: String(day.date),
    status: day.status,
    summary: day.summary,
    events: eventsResult.rows,
    auditLogs: auditsResult.rows,
  };
}
