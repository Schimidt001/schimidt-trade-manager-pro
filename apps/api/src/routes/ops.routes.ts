// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Operations Routes
// ═══════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { canOperate } from "../auth/rbac";
import {
  getOperationalState,
  setArmState,
  isShadowMode,
} from "../config/gates";
import { recordAuditLog } from "../services/auditService";
import { runTick } from "../services/decisionEngine";
import { newCorrelationId } from "../utils/correlation";

export async function registerOpsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /ops/status
   * Retorna estado operacional completo.
   * Requer: Viewer+
   */
  app.get("/ops/status", async (_request, _reply) => {
    const state = getOperationalState();
    return {
      gate: state.gate,
      arm_state: state.arm_state,
      global_mode: state.global_mode,
      execution_state: state.execution_state,
      provider_states: state.provider_states,
      executor_connectivity: state.executor_connectivity,
      timestamp: new Date().toISOString(),
    };
  });

  /**
   * POST /ops/arm
   * Arma o sistema (exceto G0 shadow).
   * Requer: Operator+
   * Body: { confirm: "ARM" }
   */
  app.post("/ops/arm", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canOperate(request.userRole!)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Requer role Operator ou Admin",
      });
    }

    const body = request.body as { confirm?: string } | null;
    if (!body || body.confirm !== "ARM") {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Confirmação obrigatória: { "confirm": "ARM" }',
      });
    }

    if (isShadowMode()) {
      return reply.code(409).send({
        error: "Conflict",
        message: "Não é possível armar em G0 (Shadow Mode). Mude o gate primeiro.",
      });
    }

    const before = getOperationalState();
    setArmState("ARMED");
    const after = getOperationalState();

    await recordAuditLog({
      actor_user_id: request.userId ?? "unknown",
      actor_role: request.userRole ?? "unknown",
      action: "MANUAL_ACTION",
      resource: "ops.arm_state",
      reason: "Sistema armado pelo operador",
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
      correlation_id: newCorrelationId(),
    });

    return { status: "ARMED", gate: after.gate };
  });

  /**
   * POST /ops/disarm
   * Desarma o sistema.
   * Requer: Operator+
   * Body: { confirm: "DISARM" }
   */
  app.post("/ops/disarm", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canOperate(request.userRole!)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Requer role Operator ou Admin",
      });
    }

    const body = request.body as { confirm?: string } | null;
    if (!body || body.confirm !== "DISARM") {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Confirmação obrigatória: { "confirm": "DISARM" }',
      });
    }

    const before = getOperationalState();
    setArmState("DISARMED");
    const after = getOperationalState();

    await recordAuditLog({
      actor_user_id: request.userId ?? "unknown",
      actor_role: request.userRole ?? "unknown",
      action: "MANUAL_ACTION",
      resource: "ops.arm_state",
      reason: "Sistema desarmado pelo operador",
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
      correlation_id: newCorrelationId(),
    });

    return { status: "DISARMED", gate: after.gate };
  });

  /**
   * POST /ops/kill
   * Kill switch: RISK_OFF + DISARM.
   * Requer: Operator+
   * Body: { confirm: "KILL" }
   */
  app.post("/ops/kill", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canOperate(request.userRole!)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Requer role Operator ou Admin",
      });
    }

    const body = request.body as { confirm?: string } | null;
    if (!body || body.confirm !== "KILL") {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Confirmação obrigatória: { "confirm": "KILL" }',
      });
    }

    const before = getOperationalState();
    setArmState("DISARMED");
    // RISK_OFF é um estado lógico — integração real virá com Agente 6
    const after = getOperationalState();

    await recordAuditLog({
      actor_user_id: request.userId ?? "unknown",
      actor_role: request.userRole ?? "unknown",
      action: "MANUAL_ACTION",
      resource: "ops.kill_switch",
      reason: "Kill switch ativado — RISK_OFF + DISARM",
      before: before as unknown as Record<string, unknown>,
      after: { ...after, risk_off: true } as unknown as Record<string, unknown>,
      correlation_id: newCorrelationId(),
    });

    return {
      status: "KILLED",
      arm_state: "DISARMED",
      risk_off: true,
      message: "Kill switch ativado. Sistema desarmado e em RISK_OFF.",
    };
  });

  /**
   * POST /ops/tick
   * Executa um ciclo manual de decisão.
   * Requer: Operator+
   * Body: { symbols: ["EURUSD", "BTCUSD"] }
   */
  app.post("/ops/tick", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canOperate(request.userRole!)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Requer role Operator ou Admin",
      });
    }

    const body = request.body as { symbols?: string[] } | null;
    if (!body || !Array.isArray(body.symbols) || body.symbols.length === 0) {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Body obrigatório: { "symbols": ["EURUSD", ...] }',
      });
    }

    try {
      const result = await runTick({ symbols: body.symbols });

      await recordAuditLog({
        actor_user_id: request.userId ?? "unknown",
        actor_role: request.userRole ?? "unknown",
        action: "MANUAL_ACTION",
        resource: "ops.tick",
        reason: `Tick manual executado para ${body.symbols.join(", ")}`,
        before: null,
        after: {
          correlation_id: result.correlation_id,
          events_persisted: result.events_persisted,
          gate: result.gate,
          commands_sent: result.commands_sent,
        },
        correlation_id: result.correlation_id,
      });

      return {
        correlation_id: result.correlation_id,
        timestamp: result.timestamp,
        gate: result.gate,
        commands_sent: result.commands_sent,
        events_persisted: result.events_persisted,
        summary: {
          snapshots: result.snapshots.length,
          intents: result.intents.length,
          decisions: result.decisions.length,
        },
      };
    } catch (err) {
      request.log.error(err, "Erro ao executar tick");
      return reply.code(500).send({
        error: "Internal Server Error",
        message: "Erro ao executar ciclo de decisão",
      });
    }
  });
}
