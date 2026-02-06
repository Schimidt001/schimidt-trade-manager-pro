// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Decisions Routes
// ═══════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  tailEvents,
  listEventsByCorrelationId,
} from "@schimidt-brain/db";
import type { LedgerEventFilters, Severity } from "@schimidt-brain/db";

const VALID_SEVERITIES: Severity[] = ["INFO", "WARN", "ERROR"];

export async function registerDecisionsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /decisions/tail?limit=200&event_type=&severity=&symbol=&brain_id=
   * Retorna os últimos N eventos do ledger (para UI).
   * Requer: Viewer+
   */
  app.get("/decisions/tail", async (request: FastifyRequest, _reply) => {
    const query = request.query as {
      limit?: string;
      event_type?: string;
      severity?: string;
      symbol?: string;
      brain_id?: string;
    };

    const limit = Math.min(parseInt(query.limit ?? "200", 10), 1000);

    const filters: LedgerEventFilters = {};
    if (query.event_type) filters.event_type = query.event_type;
    if (query.severity && VALID_SEVERITIES.includes(query.severity as Severity)) {
      filters.severity = query.severity as Severity;
    }
    if (query.symbol) filters.symbol = query.symbol;
    if (query.brain_id) filters.brain_id = query.brain_id;

    const events = await tailEvents(limit, filters);

    return {
      count: events.length,
      limit,
      events,
    };
  });

  /**
   * GET /decisions/trace/:correlation_id
   * Retorna todos os eventos de um correlation_id em ordem cronológica.
   * Requer: Viewer+
   */
  app.get("/decisions/trace/:correlation_id", async (request: FastifyRequest, _reply) => {
    const params = request.params as { correlation_id: string };
    const events = await listEventsByCorrelationId(params.correlation_id);

    return {
      correlation_id: params.correlation_id,
      count: events.length,
      events,
    };
  });
}
