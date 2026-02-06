// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Replay Routes
// ═══════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  listReplayDaysWithCounts,
  getReplayDayFull,
  getReplayDay,
} from "@schimidt-brain/db";
import type { ReplayDayStatus } from "@schimidt-brain/db";

export async function registerReplayRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /replay/days?limit=30&status=complete
   * Lista dias disponíveis para replay.
   * Requer: Viewer+
   */
  app.get("/replay/days", async (request: FastifyRequest, _reply) => {
    const query = request.query as {
      limit?: string;
      status?: string;
    };

    const limit = Math.min(parseInt(query.limit ?? "30", 10), 365);
    const status = (query.status as ReplayDayStatus) || undefined;

    const days = await listReplayDaysWithCounts(limit, status);

    return {
      count: days.length,
      limit,
      days,
    };
  });

  /**
   * GET /replay/:date
   * Retorna detalhe completo de um dia: eventos + audit logs + metadata.
   * Requer: Viewer+
   */
  app.get("/replay/:date", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { date: string };

    // Validar formato de data
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "Formato de data inválido. Use YYYY-MM-DD.",
      });
    }

    const day = await getReplayDayFull(params.date);

    if (!day) {
      return reply.code(404).send({
        error: "Not Found",
        message: `Dia ${params.date} não encontrado no replay.`,
      });
    }

    return day;
  });

  /**
   * GET /replay/:date/export
   * Exporta JSON completo de um dia para download.
   * Requer: Viewer+
   */
  app.get("/replay/:date/export", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { date: string };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "Formato de data inválido. Use YYYY-MM-DD.",
      });
    }

    const day = await getReplayDay(params.date);

    if (!day) {
      return reply.code(404).send({
        error: "Not Found",
        message: `Dia ${params.date} não encontrado no replay.`,
      });
    }

    const exportData = {
      export_version: "1.0",
      exported_at: new Date().toISOString(),
      date: params.date,
      replay_day: {
        date: params.date,
        status: day.status,
      },
      events: day.events,
      audit_logs: day.auditLogs,
    };

    reply.header("Content-Type", "application/json");
    reply.header(
      "Content-Disposition",
      `attachment; filename="replay-${params.date}.json"`
    );

    return exportData;
  });
}
