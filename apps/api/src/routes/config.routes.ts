// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Config Routes
// ═══════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { canAdmin } from "../auth/rbac";
import { recordAuditLog } from "../services/auditService";
import { persistEvent } from "../services/ledgerService";
import { newEventId, newCorrelationId, nowISO } from "../utils/correlation";
import { setGate } from "../config/gates";
import type { GateLevel } from "../config/gates";

// ─── Config em memória (v1 simples) ────────────────────────────

interface SystemConfig {
  version: number;
  gate: GateLevel;
  risk_limits: {
    max_drawdown_pct: number;
    max_exposure_pct: number;
    max_daily_loss_pct: number;
    max_positions: number;
    max_exposure_per_symbol_pct: number;
    max_exposure_per_currency_pct: number;
    max_correlated_exposure_pct: number;
  };
  symbols: string[];
  updated_at: string;
}

let _config: SystemConfig = {
  version: 1,
  gate: "G0",
  risk_limits: {
    max_drawdown_pct: 10,
    max_exposure_pct: 30,
    max_daily_loss_pct: 5,
    max_positions: 8,
    max_exposure_per_symbol_pct: 10,
    max_exposure_per_currency_pct: 20,
    max_correlated_exposure_pct: 25,
  },
  symbols: ["EURUSD", "GBPUSD", "USDJPY", "BTCUSD"],
  updated_at: new Date().toISOString(),
};

const VALID_GATES: GateLevel[] = ["G0", "G1", "G2", "G3"];

export async function registerConfigRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /config
   * Retorna config atual + versão.
   * Requer: Viewer+
   */
  app.get("/config", async (_request, _reply) => {
    return { ..._config };
  });

  /**
   * PUT /config
   * Atualiza config com reason obrigatório.
   * Requer: Admin
   * Body: { reason: string, apply: "NEXT_WINDOW"|"IMMEDIATE_IF_DISARMED", payload: {...} }
   */
  app.put("/config", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canAdmin(request.userRole!)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Requer role Admin",
      });
    }

    const body = request.body as {
      reason?: string;
      apply?: string;
      payload?: Partial<SystemConfig>;
    } | null;

    if (!body || !body.reason || typeof body.reason !== "string") {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Campo "reason" obrigatório (string)',
      });
    }

    if (
      body.apply &&
      body.apply !== "NEXT_WINDOW" &&
      body.apply !== "IMMEDIATE_IF_DISARMED"
    ) {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Campo "apply" deve ser "NEXT_WINDOW" ou "IMMEDIATE_IF_DISARMED"',
      });
    }

    const before = { ..._config };
    const correlationId = newCorrelationId();

    // Aplicar mudanças
    if (body.payload) {
      if (body.payload.gate && VALID_GATES.includes(body.payload.gate)) {
        _config.gate = body.payload.gate;
        setGate(body.payload.gate);
      }
      if (body.payload.risk_limits) {
        _config.risk_limits = {
          ..._config.risk_limits,
          ...body.payload.risk_limits,
        };
      }
      if (body.payload.symbols && Array.isArray(body.payload.symbols)) {
        _config.symbols = body.payload.symbols;
      }
    }

    _config.version += 1;
    _config.updated_at = nowISO();

    const after = { ..._config };

    // Audit log
    await recordAuditLog({
      actor_user_id: request.userId ?? "unknown",
      actor_role: request.userRole ?? "unknown",
      action: "CONFIG_CHANGE",
      resource: "system.config",
      reason: body.reason,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
      correlation_id: correlationId,
    });

    // Gravar CONFIG_SNAPSHOT no ledger
    try {
      await persistEvent({
        event_id: newEventId(),
        correlation_id: correlationId,
        timestamp: _config.updated_at,
        severity: "INFO",
        event_type: "CONFIG_SNAPSHOT",
        component: "SYSTEM",
        symbol: null,
        brain_id: null,
        reason_code: null,
        payload: {
          version: _config.version,
          config: after,
          reason: body.reason,
          apply: body.apply ?? "NEXT_WINDOW",
        },
      });
    } catch {
      // Non-blocking — config já foi salva em memória
    }

    return {
      status: "updated",
      version: _config.version,
      apply: body.apply ?? "NEXT_WINDOW",
      config: after,
    };
  });
}
