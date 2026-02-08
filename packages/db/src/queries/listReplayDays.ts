// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/db — Query: listReplayDays
// ═══════════════════════════════════════════════════════════════
// Query dedicada para a UI listar rapidamente os dias disponíveis
// para replay, com contagem de eventos por dia.
// ═══════════════════════════════════════════════════════════════

import { getPool } from "../connection";
import type { ReplayDayStatus } from "../schema/tables";

/**
 * Resultado enriquecido de um dia de replay para a UI.
 */
export interface ReplayDaySummary {
  date: string;
  status: ReplayDayStatus;
  summary: Record<string, unknown> | null;
  event_count: number;
}

/**
 * Lista dias de replay com contagem de eventos.
 * Otimizada para a UI: retorna dados suficientes para
 * renderizar uma lista/calendário de dias disponíveis.
 *
 * @param limit - Máximo de dias a retornar (default: 90)
 * @param status - Filtro opcional por status ("complete" | "partial")
 */
export async function listReplayDaysWithCounts(
  limit = 90,
  status?: ReplayDayStatus
): Promise<ReplayDaySummary[]> {
  const pool = getPool();

  const whereParts: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (status !== undefined) {
    whereParts.push(`rd.status = $${idx}`);
    params.push(status);
    idx++;
  }

  const whereClause = whereParts.length > 0
    ? `WHERE ${whereParts.join(" AND ")}`
    : "";

  params.push(limit);

  const query = `
    SELECT
      rd.date::text AS date,
      rd.status,
      rd.summary,
      COALESCE(ec.event_count, 0)::int AS event_count
    FROM replay_days rd
    LEFT JOIN (
      SELECT
        DATE(timestamp AT TIME ZONE 'UTC') AS day,
        COUNT(*) AS event_count
      FROM ledger_events
      GROUP BY DATE(timestamp AT TIME ZONE 'UTC')
    ) ec ON ec.day = rd.date
    ${whereClause}
    ORDER BY rd.date DESC
    LIMIT $${idx}
  `;

  const result = await pool.query<ReplayDaySummary>(query, params);
  return result.rows;
}
