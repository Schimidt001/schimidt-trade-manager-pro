// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/db — Query: searchLogs
// ═══════════════════════════════════════════════════════════════
// Busca de logs para a UI (/logs).
// Suporta busca por texto livre (ILIKE no payload::text),
// filtros por reason_code, event_type, symbol e range temporal.
// Prioriza performance: começa simples, UI precisa "encontrar rápido".
// ═══════════════════════════════════════════════════════════════

import { getPool } from "../connection";
import type {
  LedgerEventRow,
  SearchLogsFilters,
  TimeRange,
} from "../schema/tables";

/**
 * Resultado da busca de logs com informação de paginação.
 */
export interface SearchLogsResult {
  rows: LedgerEventRow[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Busca logs no ledger com texto livre e filtros estruturados.
 *
 * Estratégia de busca:
 * 1. Filtros estruturados (reason_code, event_type, symbol) usam índices
 * 2. Texto livre faz ILIKE no payload::text (simples e funcional)
 * 3. Range temporal obrigatório para limitar scan
 *
 * @param queryText - Texto livre para busca (opcional, busca no payload)
 * @param timeRange - Range temporal obrigatório
 * @param filters - Filtros estruturados opcionais
 * @param limit - Máximo de resultados (default: 100)
 * @param offset - Offset para paginação (default: 0)
 */
export async function searchLogs(
  queryText: string | null,
  timeRange: TimeRange,
  filters: SearchLogsFilters = {},
  limit = 100,
  offset = 0
): Promise<SearchLogsResult> {
  const pool = getPool();

  const whereParts: string[] = [
    `timestamp >= $1`,
    `timestamp <= $2`,
  ];
  const params: unknown[] = [timeRange.start, timeRange.end];
  let idx = 3;

  // Filtros estruturados (usam índices)
  if (filters.reason_code !== undefined) {
    whereParts.push(`reason_code = $${idx}`);
    params.push(filters.reason_code);
    idx++;
  }
  if (filters.event_type !== undefined) {
    whereParts.push(`event_type = $${idx}`);
    params.push(filters.event_type);
    idx++;
  }
  if (filters.symbol !== undefined) {
    whereParts.push(`symbol = $${idx}`);
    params.push(filters.symbol);
    idx++;
  }

  // Texto livre: busca ILIKE no payload serializado
  if (queryText && queryText.trim().length > 0) {
    whereParts.push(`payload::text ILIKE $${idx}`);
    params.push(`%${queryText.trim()}%`);
    idx++;
  }

  const whereClause = whereParts.join(" AND ");

  // Query de contagem (para paginação)
  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM ledger_events
    WHERE ${whereClause}
  `;
  const countResult = await pool.query<{ total: number }>(countQuery, params);
  const total = countResult.rows[0]?.total ?? 0;

  // Query de dados
  params.push(limit, offset);
  const dataQuery = `
    SELECT * FROM ledger_events
    WHERE ${whereClause}
    ORDER BY timestamp DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;
  const dataResult = await pool.query<LedgerEventRow>(dataQuery, params);

  return {
    rows: dataResult.rows,
    total,
    limit,
    offset,
  };
}
