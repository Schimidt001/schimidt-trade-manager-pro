// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Replay Routes
// ═══════════════════════════════════════════════════════════════
// Endpoints para replay diário funcional.
// Replay NÃO é JSON cru — é história do dia.
//
// Endpoints:
//   GET  /replay/days           — Lista dias com auto-discovery
//   GET  /replay/:date          — Detalhe completo + narrativa
//   GET  /replay/:date/narrative — Narrativa pura do dia
//   GET  /replay/:date/export   — Export JSON para download
//   POST /replay/aggregate      — Força agregação manual
// ═══════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  listReplayDaysWithCounts,
  getReplayDayFull,
  getReplayDay,
} from "@schimidt-brain/db";
import type { ReplayDayStatus } from "@schimidt-brain/db";
import { buildReplayDayNarrative } from "../services/replayNarrativeService";
import type { AggregationResult } from "../services/replayAggregatorService";
import { aggregateReplayDays, aggregateToday } from "../services/replayAggregatorService";
import { canOperate } from "../auth/rbac";

export async function registerReplayRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /replay/days?limit=30&status=complete
   * Lista dias disponíveis para replay.
   * Auto-discovery: agrega dias automaticamente antes de listar.
   * Requer: Viewer+
   */
  app.get("/replay/days", async (request: FastifyRequest, _reply) => {
    const query = request.query as {
      limit?: string;
      status?: string;
    };

    const limit = Math.min(parseInt(query.limit ?? "30", 10), 365);
    const status = (query.status as ReplayDayStatus) || undefined;

    // Auto-discovery: agregar dias que têm eventos mas não têm replay_day
    try {
      await aggregateReplayDays(limit);
    } catch (err) {
      // Non-blocking — se falhar, retorna o que já existe
      request.log.warn({ err }, "Falha na auto-agregação de replay days");
    }

    const days = await listReplayDaysWithCounts(limit, status);

    return {
      count: days.length,
      limit,
      days,
    };
  });

  /**
   * GET /replay/:date
   * Retorna detalhe completo de um dia: eventos + audit logs + metadata + narrativa.
   * Requer: Viewer+
   */
  app.get("/replay/:date", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { date: string };

    // Validar formato de data
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "Formato de data inválido. Use YYYY-MM-DD.",
        reason_code: "INVALID_DATE_FORMAT",
      });
    }

    // Tentar agregar o dia se não existir
    try {
      await aggregateToday();
    } catch {
      // Non-blocking
    }

    const day = await getReplayDayFull(params.date);

    if (!day) {
      return reply.code(404).send({
        error: "Not Found",
        message: `Dia ${params.date} não encontrado no replay. Execute um tick primeiro para gerar eventos.`,
        reason_code: "REPLAY_DAY_NOT_FOUND",
      });
    }

    // Gerar narrativa junto com os dados
    const narrative = buildReplayDayNarrative(params.date, day.events, day.auditLogs);

    return {
      date: day.date,
      status: day.status,
      stats: day.stats,
      narrative: narrative.summary,
      timeline: narrative.timeline,
      why_no_trade: narrative.why_no_trade,
      brain_explanations: narrative.brain_explanations,
      events: day.events,
      audit_logs: day.auditLogs,
    };
  });

  /**
   * GET /replay/:date/narrative
   * Retorna APENAS a narrativa do dia (sem eventos crus).
   * Endpoint leve para UI que só precisa da história.
   * Requer: Viewer+
   */
  app.get("/replay/:date/narrative", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { date: string };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "Formato de data inválido. Use YYYY-MM-DD.",
        reason_code: "INVALID_DATE_FORMAT",
      });
    }

    // Tentar agregar o dia se não existir
    try {
      await aggregateToday();
    } catch {
      // Non-blocking
    }

    const day = await getReplayDay(params.date);

    if (!day) {
      return reply.code(404).send({
        error: "Not Found",
        message: `Dia ${params.date} não encontrado no replay.`,
        reason_code: "REPLAY_DAY_NOT_FOUND",
      });
    }

    const narrative = buildReplayDayNarrative(params.date, day.events, day.auditLogs);

    return narrative;
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
        reason_code: "INVALID_DATE_FORMAT",
      });
    }

    const day = await getReplayDay(params.date);

    if (!day) {
      return reply.code(404).send({
        error: "Not Found",
        message: `Dia ${params.date} não encontrado no replay.`,
        reason_code: "REPLAY_DAY_NOT_FOUND",
      });
    }

    // Incluir narrativa no export
    const narrative = buildReplayDayNarrative(params.date, day.events, day.auditLogs);

    const exportData = {
      export_version: "2.0",
      exported_at: new Date().toISOString(),
      date: params.date,
      replay_day: {
        date: params.date,
        status: day.status,
      },
      narrative: narrative.summary,
      timeline: narrative.timeline,
      why_no_trade: narrative.why_no_trade,
      brain_explanations: narrative.brain_explanations,
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

  /**
   * POST /replay/aggregate
   * Força agregação manual de replay days.
   * Requer: Operator+
   * Body: { lookback_days?: number }
   */
  app.post("/replay/aggregate", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canOperate(request.userRole!)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Requer role Operator ou Admin para forçar agregação",
      });
    }

    const body = request.body as { lookback_days?: number } | null;
    const lookbackDays = Math.min(body?.lookback_days ?? 30, 365);

    try {
      const results = await aggregateReplayDays(lookbackDays);
      return {
        status: "aggregated",
        lookback_days: lookbackDays,
        days_processed: results.length,
        days_created: results.filter((r: AggregationResult) => r.created).length,
        results,
      };
    } catch (err) {
      request.log.error(err, "Erro na agregação de replay days");
      return reply.code(500).send({
        error: "Internal Server Error",
        message: "Erro ao agregar replay days",
      });
    }
  });
}
