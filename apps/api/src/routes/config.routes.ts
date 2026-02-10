// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Config Routes
// ═══════════════════════════════════════════════════════════════
// CORREÇÃO: Gate NÃO pode ser alterado via PUT /config.
// Gate DEVE ser alterado EXCLUSIVAMENTE via POST /ops/gate/promote.
// Erro 400 genérico substituído por reason_code explícito.
// ═══════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { canAdmin } from "../auth/rbac";
import { recordAuditLog } from "../services/auditService";
import { persistEvent } from "../services/ledgerService";
import { newEventId, newCorrelationId, nowISO } from "../utils/correlation";
import { getOperationalState } from "../config/gates";
import type { GateLevel } from "../config/gates";
import { ReasonCode } from "@schimidt-brain/contracts";

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
  symbols: ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD"],
  updated_at: new Date().toISOString(),
};

export async function registerConfigRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /config
   * Retorna config atual + versão.
   * Gate é lido do estado operacional (fonte única de verdade).
   * Requer: Viewer+
   */
  app.get("/config", async (_request, _reply) => {
    // Gate sempre vem do estado operacional, não da config local
    const opsState = getOperationalState();
    return {
      ..._config,
      gate: opsState.gate,
    };
  });

  /**
   * PUT /config
   * Atualiza config com reason obrigatório.
   * GATE NÃO PODE SER ALTERADO POR AQUI — usar POST /ops/gate/promote.
   * Requer: Admin
   * Body: { reason: string, apply: "NEXT_WINDOW"|"IMMEDIATE_IF_DISARMED", payload: {...} }
   *
   * Erros retornados com reason_code explícito (NUNCA 400 genérico):
   *   - 400 + AUDIT_CONFIG_CHANGED: reason ausente
   *   - 400 + AUDIT_PARAM_UPDATED: apply inválido
   *   - 409 + GATE_INVALID_TRANSITION: tentativa de alterar gate via config
   *   - 403: role insuficiente
   */
  app.put("/config", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canAdmin(request.userRole!)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Requer role Admin para alterar configurações",
        reason_code: ReasonCode.AUDIT_PERMISSION_CHANGE,
        hint: "Verifique se sua API key tem role Admin.",
      });
    }

    const body = request.body as {
      reason?: string;
      apply?: string;
      payload?: Partial<SystemConfig>;
    } | null;

    // ─── Validação: reason obrigatório ────────────────────────
    if (!body || !body.reason || typeof body.reason !== "string" || body.reason.trim().length < 5) {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Campo "reason" obrigatório (string com mínimo 5 caracteres). Descreva o motivo da alteração.',
        reason_code: ReasonCode.AUDIT_CONFIG_CHANGED,
        hint: 'Envie { "reason": "Motivo da alteração", "payload": { ... } }',
      });
    }

    // ─── Validação: apply ─────────────────────────────────────
    if (
      body.apply &&
      body.apply !== "NEXT_WINDOW" &&
      body.apply !== "IMMEDIATE_IF_DISARMED"
    ) {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Campo "apply" deve ser "NEXT_WINDOW" ou "IMMEDIATE_IF_DISARMED"',
        reason_code: ReasonCode.AUDIT_PARAM_UPDATED,
        hint: 'Valores aceitos: "NEXT_WINDOW" (padrão) ou "IMMEDIATE_IF_DISARMED".',
      });
    }

    // ─── BLOQUEIO: Gate NÃO pode ser alterado via config ──────
    if (body.payload && body.payload.gate !== undefined) {
      return reply.code(409).send({
        error: "Conflict",
        message: "Gate NÃO pode ser alterado via PUT /config. Use POST /ops/gate/promote para promover ou demover o gate de forma institucional, com validação de pré-requisitos e audit trail.",
        reason_code: ReasonCode.GATE_INVALID_TRANSITION,
        hint: 'Envie POST /ops/gate/promote com { "to_gate": "G1", "confirm": "PROMOTE_GATE", "reason": "..." }',
        current_gate: getOperationalState().gate,
        attempted_gate: body.payload.gate,
      });
    }

    // ─── Validação: payload deve ter conteúdo ──────────────────
    if (!body.payload || Object.keys(body.payload).length === 0) {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Campo "payload" obrigatório com pelo menos uma alteração (risk_limits ou symbols).',
        reason_code: ReasonCode.AUDIT_PARAM_UPDATED,
        hint: 'Envie { "reason": "...", "payload": { "risk_limits": { ... } } }',
      });
    }

    const before = { ..._config, gate: getOperationalState().gate };
    const correlationId = newCorrelationId();

    // ─── Aplicar mudanças (exceto gate) ───────────────────────
    if (body.payload.risk_limits) {
      // Validar que os valores são números positivos
      const rl = body.payload.risk_limits;
      for (const [key, value] of Object.entries(rl)) {
        if (typeof value !== "number" || value < 0) {
          return reply.code(400).send({
            error: "Bad Request",
            message: `risk_limits.${key} deve ser um número positivo. Recebido: ${value}`,
            reason_code: ReasonCode.AUDIT_PARAM_UPDATED,
            hint: "Todos os valores de risk_limits devem ser números >= 0.",
          });
        }
      }

      _config.risk_limits = {
        ..._config.risk_limits,
        ...body.payload.risk_limits,
      };
    }

    if (body.payload.symbols) {
      if (!Array.isArray(body.payload.symbols) || body.payload.symbols.length === 0) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "symbols deve ser um array não-vazio de strings",
          reason_code: ReasonCode.AUDIT_PARAM_UPDATED,
          hint: 'Envie { "symbols": ["EURUSD", "GBPUSD", ...] }',
        });
      }
      _config.symbols = body.payload.symbols;
    }

    _config.version += 1;
    _config.updated_at = nowISO();

    const after = { ..._config, gate: getOperationalState().gate };

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
        reason_code: ReasonCode.AUDIT_CONFIG_CHANGED,
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
      reason_code: ReasonCode.AUDIT_CONFIG_CHANGED,
      config: after,
    };
  });
}
