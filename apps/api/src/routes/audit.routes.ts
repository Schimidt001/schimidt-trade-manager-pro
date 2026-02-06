// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Audit Routes
// ═══════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { listAuditLogs } from "@schimidt-brain/db";
import type { AuditLogFilters, TimeRange } from "@schimidt-brain/db";

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /audit?start=&end=&resource=&actor=&limit=100&offset=0
   * Lista audit logs com filtros opcionais.
   * Requer: Viewer+
   */
  app.get("/audit", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      start?: string;
      end?: string;
      resource?: string;
      actor?: string;
      limit?: string;
      offset?: string;
    };

    // Default: últimas 24h se não especificado
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const timeRange: TimeRange = {
      start: query.start ?? dayAgo.toISOString(),
      end: query.end ?? now.toISOString(),
    };

    const filters: AuditLogFilters = {};
    if (query.resource) filters.resource = query.resource;
    if (query.actor) filters.actor_user_id = query.actor;

    const limit = Math.min(parseInt(query.limit ?? "100", 10), 1000);
    const offset = parseInt(query.offset ?? "0", 10);

    try {
      const logs = await listAuditLogs(timeRange, filters, limit, offset);

      return {
        count: logs.length,
        limit,
        offset,
        time_range: timeRange,
        logs,
      };
    } catch (err) {
      request.log.error(err, "Erro ao listar audit logs");
      return reply.code(500).send({
        error: "Internal Server Error",
        message: "Erro ao buscar audit logs",
      });
    }
  });
}
