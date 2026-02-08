// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Replay Aggregator Service
// ═══════════════════════════════════════════════════════════════
// Agregador de replay que cria/atualiza dias de replay
// automaticamente a partir dos eventos do ledger.
//
// Responsabilidades:
//   1. Detectar dias com eventos no ledger que não têm replay_day
//   2. Criar replay_day automaticamente com status correto
//   3. Atualizar summary do replay_day com estatísticas
//
// Este serviço é chamado:
//   - Pelo endpoint GET /replay/days (auto-discovery)
//   - Pelo endpoint POST /replay/aggregate (manual)
//   - Após cada tick (para garantir que o dia atual tenha replay)
// ═══════════════════════════════════════════════════════════════

import { getPool, upsertReplayDay } from "@schimidt-brain/db";
import type { ReplayDayStatus } from "@schimidt-brain/db";

/**
 * Resultado da agregação de um dia.
 */
export interface AggregationResult {
  date: string;
  status: ReplayDayStatus;
  event_count: number;
  created: boolean;
}

/**
 * Descobre dias com eventos no ledger que ainda não têm replay_day
 * e cria automaticamente.
 *
 * @param lookbackDays - Quantos dias para trás verificar (default: 30)
 * @returns Lista de dias criados/atualizados
 */
export async function aggregateReplayDays(lookbackDays = 30): Promise<AggregationResult[]> {
  const pool = getPool();
  const results: AggregationResult[] = [];

  // 1. Descobrir dias com eventos no ledger
  const daysQuery = await pool.query<{ day: string; event_count: number }>(
    `SELECT
       DATE(timestamp AT TIME ZONE 'UTC')::text AS day,
       COUNT(*)::int AS event_count
     FROM ledger_events
     WHERE timestamp >= NOW() - INTERVAL '${lookbackDays} days'
     GROUP BY DATE(timestamp AT TIME ZONE 'UTC')
     ORDER BY day DESC`
  );

  // 2. Verificar quais já existem em replay_days
  const existingQuery = await pool.query<{ date: string }>(
    `SELECT date::text FROM replay_days
     WHERE date >= (CURRENT_DATE - INTERVAL '${lookbackDays} days')`
  );
  const existingDates = new Set(existingQuery.rows.map((r: { date: string }) => r.date));

  // 3. Criar replay_day para dias que não existem
  for (const row of daysQuery.rows) {
    const date = row.day;
    const eventCount = row.event_count;

    // Determinar status: "complete" se tem MCL_SNAPSHOT + pelo menos um brain event
    const statusCheck = await pool.query<{ has_mcl: boolean; has_brain: boolean }>(
      `SELECT
         EXISTS(
           SELECT 1 FROM ledger_events
           WHERE DATE(timestamp AT TIME ZONE 'UTC') = $1
             AND event_type = 'MCL_SNAPSHOT'
         ) AS has_mcl,
         EXISTS(
           SELECT 1 FROM ledger_events
           WHERE DATE(timestamp AT TIME ZONE 'UTC') = $1
             AND event_type IN ('BRAIN_INTENT', 'BRAIN_SKIP')
         ) AS has_brain`,
      [date]
    );

    const check = statusCheck.rows[0];
    const status: ReplayDayStatus = check?.has_mcl && check?.has_brain ? "complete" : "partial";

    const isNew = !existingDates.has(date);

    // Upsert (cria ou atualiza)
    await upsertReplayDay({
      date,
      status,
      summary: {
        event_count: eventCount,
        aggregated_at: new Date().toISOString(),
        auto_generated: true,
      },
    });

    results.push({
      date,
      status,
      event_count: eventCount,
      created: isNew,
    });
  }

  return results;
}

/**
 * Agrega o dia atual (hoje UTC).
 * Chamado após cada tick para garantir que o dia atual tenha replay.
 */
export async function aggregateToday(): Promise<AggregationResult | null> {
  const pool = getPool();
  const today = new Date().toISOString().slice(0, 10);

  // Verificar se há eventos hoje
  const countResult = await pool.query<{ event_count: number }>(
    `SELECT COUNT(*)::int AS event_count
     FROM ledger_events
     WHERE DATE(timestamp AT TIME ZONE 'UTC') = $1`,
    [today]
  );

  const eventCount = countResult.rows[0]?.event_count ?? 0;
  if (eventCount === 0) return null;

  // Verificar completude
  const statusCheck = await pool.query<{ has_mcl: boolean; has_brain: boolean }>(
    `SELECT
       EXISTS(
         SELECT 1 FROM ledger_events
         WHERE DATE(timestamp AT TIME ZONE 'UTC') = $1
           AND event_type = 'MCL_SNAPSHOT'
       ) AS has_mcl,
       EXISTS(
         SELECT 1 FROM ledger_events
         WHERE DATE(timestamp AT TIME ZONE 'UTC') = $1
           AND event_type IN ('BRAIN_INTENT', 'BRAIN_SKIP')
       ) AS has_brain`,
    [today]
  );

  const check = statusCheck.rows[0];
  const status: ReplayDayStatus = check?.has_mcl && check?.has_brain ? "complete" : "partial";

  await upsertReplayDay({
    date: today,
    status,
    summary: {
      event_count: eventCount,
      aggregated_at: new Date().toISOString(),
      auto_generated: true,
    },
  });

  return {
    date: today,
    status,
    event_count: eventCount,
    created: true,
  };
}
