// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/db — Ledger Repository
// ═══════════════════════════════════════════════════════════════
// Funções de acesso a dados para a tabela ledger_events.
// Todas as operações são idempotentes por event_id.
// Payload armazena JSON completo conforme contracts.
// ═══════════════════════════════════════════════════════════════

import { getPool } from "../connection";
import type {
  LedgerEventRow,
  LedgerEventInput,
  LedgerEventFilters,
  TimeRange,
} from "../schema/tables";

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Constrói cláusulas WHERE dinâmicas a partir de filtros opcionais.
 * Retorna { clause, params, nextIdx } para composição segura.
 */
function buildFilterClauses(
  filters: LedgerEventFilters,
  startIdx: number
): { clauses: string[]; params: unknown[]; nextIdx: number } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;

  if (filters.symbol !== undefined) {
    clauses.push(`symbol = $${idx}`);
    params.push(filters.symbol);
    idx++;
  }
  if (filters.brain_id !== undefined) {
    clauses.push(`brain_id = $${idx}`);
    params.push(filters.brain_id);
    idx++;
  }
  if (filters.severity !== undefined) {
    clauses.push(`severity = $${idx}`);
    params.push(filters.severity);
    idx++;
  }
  if (filters.event_type !== undefined) {
    clauses.push(`event_type = $${idx}`);
    params.push(filters.event_type);
    idx++;
  }
  if (filters.reason_code !== undefined) {
    clauses.push(`reason_code = $${idx}`);
    params.push(filters.reason_code);
    idx++;
  }

  return { clauses, params, nextIdx: idx };
}

// ─── Repository ─────────────────────────────────────────────────

/**
 * Insere um evento no ledger.
 * Idempotente: ON CONFLICT (event_id) DO NOTHING.
 * Retorna true se inseriu, false se já existia.
 */
export async function insertEvent(event: LedgerEventInput): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO ledger_events
       (event_id, correlation_id, timestamp, severity, event_type,
        component, symbol, brain_id, reason_code, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (event_id) DO NOTHING`,
    [
      event.event_id,
      event.correlation_id,
      event.timestamp,
      event.severity,
      event.event_type,
      event.component,
      event.symbol ?? null,
      event.brain_id ?? null,
      event.reason_code ?? null,
      JSON.stringify(event.payload),
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Insere múltiplos eventos em batch (transação única).
 * Idempotente: ON CONFLICT (event_id) DO NOTHING para cada evento.
 * Retorna o número de eventos efetivamente inseridos.
 */
export async function insertEvents(events: LedgerEventInput[]): Promise<number> {
  if (events.length === 0) return 0;

  const pool = getPool();
  const client = await pool.connect();
  let inserted = 0;

  try {
    await client.query("BEGIN");

    for (const event of events) {
      const result = await client.query(
        `INSERT INTO ledger_events
           (event_id, correlation_id, timestamp, severity, event_type,
            component, symbol, brain_id, reason_code, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (event_id) DO NOTHING`,
        [
          event.event_id,
          event.correlation_id,
          event.timestamp,
          event.severity,
          event.event_type,
          event.component,
          event.symbol ?? null,
          event.brain_id ?? null,
          event.reason_code ?? null,
          JSON.stringify(event.payload),
        ]
      );
      inserted += result.rowCount ?? 0;
    }

    await client.query("COMMIT");
    return inserted;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lista eventos por range temporal com filtros opcionais.
 * Ordenados por timestamp DESC (mais recentes primeiro).
 */
export async function listEventsByTimeRange(
  timeRange: TimeRange,
  filters: LedgerEventFilters = {},
  limit = 500,
  offset = 0
): Promise<LedgerEventRow[]> {
  const pool = getPool();

  const baseParams: unknown[] = [timeRange.start, timeRange.end];
  const { clauses, params: filterParams, nextIdx } = buildFilterClauses(filters, 3);

  const whereParts = [
    `timestamp >= $1`,
    `timestamp <= $2`,
    ...clauses,
  ];

  const allParams = [...baseParams, ...filterParams, limit, offset];
  const limitIdx = nextIdx;
  const offsetIdx = nextIdx + 1;

  const query = `
    SELECT * FROM ledger_events
    WHERE ${whereParts.join(" AND ")}
    ORDER BY timestamp DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const result = await pool.query<LedgerEventRow>(query, allParams);
  return result.rows;
}

/**
 * Lista todos os eventos de uma cadeia de correlação.
 * Ordenados por timestamp ASC (ordem cronológica).
 */
export async function listEventsByCorrelationId(
  correlationId: string
): Promise<LedgerEventRow[]> {
  const pool = getPool();
  const result = await pool.query<LedgerEventRow>(
    `SELECT * FROM ledger_events
     WHERE correlation_id = $1
     ORDER BY timestamp ASC`,
    [correlationId]
  );
  return result.rows;
}

/**
 * Retorna os N eventos mais recentes (tail).
 * Usado para /decisions/live (streaming de decisões).
 */
export async function tailEvents(
  limit = 50,
  filters: LedgerEventFilters = {}
): Promise<LedgerEventRow[]> {
  const pool = getPool();

  const { clauses, params: filterParams, nextIdx } = buildFilterClauses(filters, 1);

  const whereParts = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const allParams = [...filterParams, limit];

  const query = `
    SELECT * FROM ledger_events
    ${whereParts}
    ORDER BY timestamp DESC
    LIMIT $${nextIdx}
  `;

  const result = await pool.query<LedgerEventRow>(query, allParams);
  return result.rows;
}
