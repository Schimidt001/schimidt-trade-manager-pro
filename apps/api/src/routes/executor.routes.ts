// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Executor Routes
// ═══════════════════════════════════════════════════════════════
// Rotas para integração com o executor:
//   GET  /executor/status   — Status do executor (Viewer+)
//   POST /executor/command  — Enviar comando (Operator+)
//   POST /executor/events   — Webhook receiver (secret header)
// ═══════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { canOperate } from "../auth/rbac";
import {
  getExecutorStatus,
  applyCommands,
  handleExecutorEvent,
} from "../services/executorService";
import { newCorrelationId } from "../utils/correlation";
import { recordAuditLog } from "../services/auditService";
import type { ExecutorCommand, ExecutorEvent } from "@schimidt-brain/adapters";

// ─── Webhook Secret ────────────────────────────────────────────

function getWebhookSecret(): string {
  return process.env.EXECUTOR_WEBHOOK_SECRET ?? "";
}

// ─── Registrar Rotas ───────────────────────────────────────────

export async function registerExecutorRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /executor/status
   * Retorna o status atual do executor.
   * Requer: Viewer+
   */
  app.get("/executor/status", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await getExecutorStatus();

      if (!status) {
        return reply.code(503).send({
          error: "Service Unavailable",
          message: "Executor não está acessível",
          connected: false,
          timestamp: new Date().toISOString(),
        });
      }

      return status;
    } catch (err) {
      return reply.code(500).send({
        error: "Internal Server Error",
        message: "Erro ao obter status do executor",
      });
    }
  });

  /**
   * POST /executor/command
   * Envia um ou mais comandos ao executor.
   * Requer: Operator+
   *
   * Body:
   *   { command: ExecutorCommand }
   *   ou
   *   { commands: ExecutorCommand[] }
   */
  app.post("/executor/command", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canOperate(request.userRole!)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Requer role Operator ou Admin",
      });
    }

    const body = request.body as {
      command?: ExecutorCommand;
      commands?: ExecutorCommand[];
    } | null;

    if (!body) {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Body obrigatório: { "command": {...} } ou { "commands": [...] }',
      });
    }

    // Aceitar comando único ou batch
    let commands: ExecutorCommand[];
    if (body.commands && Array.isArray(body.commands)) {
      commands = body.commands;
    } else if (body.command && typeof body.command === "object") {
      commands = [body.command];
    } else {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Body deve conter "command" (objeto) ou "commands" (array)',
      });
    }

    // Validar que cada comando tem type
    for (const cmd of commands) {
      if (!cmd.type || typeof cmd.type !== "string") {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Cada comando deve ter um campo 'type' (string)",
        });
      }
    }

    const correlationId = newCorrelationId();

    try {
      const result = await applyCommands(commands, correlationId);

      // Audit log
      await recordAuditLog({
        actor_user_id: request.userId ?? "unknown",
        actor_role: request.userRole ?? "unknown",
        action: "MANUAL_ACTION",
        resource: "executor.command",
        reason: `Comandos enviados ao executor: ${commands.map((c) => c.type).join(", ")}`,
        before: null,
        after: {
          correlation_id: correlationId,
          total: result.total,
          succeeded: result.succeeded,
          failed: result.failed,
        },
        correlation_id: correlationId,
      });

      return {
        correlation_id: correlationId,
        ...result,
      };
    } catch (err) {
      request.log.error(err, "Erro ao enviar comandos ao executor");
      return reply.code(500).send({
        error: "Internal Server Error",
        message: "Erro ao enviar comandos ao executor",
      });
    }
  });

  /**
   * POST /executor/events
   * Webhook receiver para eventos do executor.
   * Valida assinatura via header: X-Executor-Secret
   *
   * Body: ExecutorEvent
   */
  app.post("/executor/events", async (request: FastifyRequest, reply: FastifyReply) => {
    // Validar secret
    const secret = getWebhookSecret();
    if (secret) {
      const headerSecret = request.headers["x-executor-secret"] as string | undefined;
      if (!headerSecret || headerSecret !== secret) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "X-Executor-Secret inválido ou ausente",
        });
      }
    }

    const body = request.body as ExecutorEvent | null;
    if (!body || !body.type || !body.symbol) {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Body obrigatório: { "type": "...", "symbol": "...", "strategy": "...", "details": {...} }',
      });
    }

    // Garantir campos obrigatórios
    const event: ExecutorEvent = {
      type: body.type,
      symbol: body.symbol,
      strategy: body.strategy ?? "UNKNOWN",
      details: body.details ?? {},
      timestamp: body.timestamp ?? new Date().toISOString(),
    };

    try {
      await handleExecutorEvent(event);

      return {
        ok: true,
        message: "Evento recebido e processado",
        event_type: event.type,
        symbol: event.symbol,
      };
    } catch (err) {
      request.log.error(err, "Erro ao processar evento do executor");
      return reply.code(500).send({
        error: "Internal Server Error",
        message: "Erro ao processar evento do executor",
      });
    }
  });
}
