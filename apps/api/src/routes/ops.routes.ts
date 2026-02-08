// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Operations Routes
// ═══════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { canOperate, canAdmin } from "../auth/rbac";
import {
  getOperationalState,
  setArmState,
  setGate,
  setRiskOff,
  setLastTickResult,
  isShadowMode,
} from "../config/gates";
import type { GateLevel } from "../config/gates";
import { recordAuditLog } from "../services/auditService";
import { runTick } from "../services/decisionEngine";
import { newCorrelationId } from "../utils/correlation";
import { getExecutorStatus } from "../services/executorService";
import { ReasonCode, REASON_CODE_CATALOG } from "@schimidt-brain/contracts";


export async function registerOpsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /ops/status
   * Retorna estado operacional completo.
   * Requer: Viewer+
   */
  app.get("/ops/status", async (_request, _reply) => {
    const state = getOperationalState();

    // Obter status do executor (non-blocking — se falhar, retorna null)
    let executorStatus = null;
    try {
      executorStatus = await getExecutorStatus();
    } catch {
      // Executor inacessível — connectivity já atualizada pelo service
    }

    return {
      gate: state.gate,
      arm_state: state.arm_state,
      global_mode: state.global_mode,
      execution_state: state.execution_state,
      provider_states: state.provider_states,
      executor_connectivity: state.executor_connectivity,
      executor_status: executorStatus,
      mock_mode: state.mock_mode,
      risk_off: state.risk_off,
      last_tick_result: state.last_tick_result,
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
    setRiskOff(true);
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

  // ═══════════════════════════════════════════════════════════════
  // POST /ops/gate/promote — Entrega A
  // Promove gate de forma institucional com validação de pré-requisitos.
  // Requer: Admin
  // Body: { "to_gate": "G1", "confirm": "PROMOTE_GATE", "reason": "..." }
  // ═══════════════════════════════════════════════════════════════
  app.post("/ops/gate/promote", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canAdmin(request.userRole!)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Requer role Admin para promover gate",
      });
    }

    const body = request.body as {
      to_gate?: string;
      confirm?: string;
      reason?: string;
    } | null;

    if (!body || body.confirm !== "PROMOTE_GATE" || !body.to_gate || !body.reason) {
      return reply.code(400).send({
        error: "Bad Request",
        message: 'Body obrigatório: { "to_gate": "G1", "confirm": "PROMOTE_GATE", "reason": "..." }',
      });
    }

    const validGates: GateLevel[] = ["G0", "G1", "G2", "G3"];
    if (!validGates.includes(body.to_gate as GateLevel)) {
      return reply.code(400).send({
        error: "Bad Request",
        message: `Gate inválido: ${body.to_gate}. Valores aceitos: G0, G1, G2, G3`,
        reason_code: ReasonCode.GATE_INVALID_TRANSITION,
      });
    }

    const state = getOperationalState();
    const fromGate = state.gate;
    const toGate = body.to_gate as GateLevel;

    // Validar transição sequencial (só pode subir 1 nível por vez)
    const gateOrder: GateLevel[] = ["G0", "G1", "G2", "G3"];
    const fromIdx = gateOrder.indexOf(fromGate);
    const toIdx = gateOrder.indexOf(toGate);

    // Permitir demoção (voltar para qualquer gate inferior) sem pré-requisitos
    if (toIdx < fromIdx) {
      const before = getOperationalState();
      setGate(toGate);
      // Se voltou para G0, desarmar automaticamente
      if (toGate === "G0") {
        setArmState("DISARMED");
      }
      const after = getOperationalState();

      await recordAuditLog({
        actor_user_id: request.userId ?? "unknown",
        actor_role: request.userRole ?? "unknown",
        action: "MANUAL_ACTION",
        resource: "ops.gate",
        reason: `Gate demovido: ${fromGate} → ${toGate}. Motivo: ${body.reason}`,
        before: before as unknown as Record<string, unknown>,
        after: after as unknown as Record<string, unknown>,
        correlation_id: newCorrelationId(),
      });

      return {
        status: "DEMOTED",
        from_gate: fromGate,
        to_gate: toGate,
        reason_code: ReasonCode.GATE_PROMOTED,
        message: `Gate demovido de ${fromGate} para ${toGate}`,
      };
    }

    // Promoção: só pode subir 1 nível por vez
    if (toIdx !== fromIdx + 1) {
      return reply.code(409).send({
        error: "Conflict",
        message: `Transição inválida: ${fromGate} → ${toGate}. Promoção deve ser sequencial (ex: G0→G1, G1→G2).`,
        reason_code: ReasonCode.GATE_INVALID_TRANSITION,
      });
    }

    // ─── Validar pré-requisitos para promoção ──────────────────
    const missing: { reason_code: string; message: string }[] = [];

    // Pré-requisito 1: Tick gerou MCL_SNAPSHOT
    if (!state.last_tick_result || !state.last_tick_result.has_mcl_snapshot) {
      missing.push({
        reason_code: ReasonCode.GATE_PREREQ_MISSING_MCL_SNAPSHOT,
        message: REASON_CODE_CATALOG[ReasonCode.GATE_PREREQ_MISSING_MCL_SNAPSHOT],
      });
    }

    // Pré-requisito 2: Tick gerou BRAIN_INTENT ou BRAIN_SKIP
    if (!state.last_tick_result || !state.last_tick_result.has_brain_intent_or_skip) {
      missing.push({
        reason_code: ReasonCode.GATE_PREREQ_MISSING_BRAIN_INTENT,
        message: REASON_CODE_CATALOG[ReasonCode.GATE_PREREQ_MISSING_BRAIN_INTENT],
      });
    }

    // Pré-requisito 3: Tick gerou PM_DECISION
    if (!state.last_tick_result || !state.last_tick_result.has_pm_decision) {
      missing.push({
        reason_code: ReasonCode.GATE_PREREQ_MISSING_PM_DECISION,
        message: REASON_CODE_CATALOG[ReasonCode.GATE_PREREQ_MISSING_PM_DECISION],
      });
    }

    // Pré-requisito 4: Ledger funcional (events_persisted > 0)
    if (!state.last_tick_result || state.last_tick_result.events_persisted === 0) {
      missing.push({
        reason_code: ReasonCode.GATE_PREREQ_MISSING_LEDGER,
        message: REASON_CODE_CATALOG[ReasonCode.GATE_PREREQ_MISSING_LEDGER],
      });
    }

    // Pré-requisito 5: Executor conectado
    if (state.executor_connectivity !== "connected") {
      missing.push({
        reason_code: ReasonCode.GATE_PREREQ_MISSING_EXECUTOR,
        message: REASON_CODE_CATALOG[ReasonCode.GATE_PREREQ_MISSING_EXECUTOR],
      });
    }

    // Pré-requisito 6: RBAC ok (já validado acima — Admin)
    // Se chegou aqui, RBAC está ok.

    if (missing.length > 0) {
      return reply.code(409).send({
        error: "Conflict",
        message: `Promoção ${fromGate} → ${toGate} negada: ${missing.length} pré-requisito(s) não atendido(s)`,
        missing_prerequisites: missing,
        hint: "Execute /ops/tick primeiro para validar o pipeline completo, e certifique-se de que o executor está conectado.",
      });
    }

    // ─── Promoção autorizada ───────────────────────────────────
    const before = getOperationalState();
    setGate(toGate);
    const after = getOperationalState();

    const corrId = newCorrelationId();

    await recordAuditLog({
      actor_user_id: request.userId ?? "unknown",
      actor_role: request.userRole ?? "unknown",
      action: "MANUAL_ACTION",
      resource: "ops.gate",
      reason: `Gate promovido: ${fromGate} → ${toGate}. Motivo: ${body.reason}`,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
      correlation_id: corrId,
    });

    return {
      status: "PROMOTED",
      from_gate: fromGate,
      to_gate: toGate,
      reason_code: ReasonCode.GATE_PROMOTED,
      message: `Gate promovido de ${fromGate} para ${toGate}`,
      correlation_id: corrId,
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

      // Entrega A: Armazenar resultado do tick para validação de gate promotion
      setLastTickResult({
        has_mcl_snapshot: result.snapshots.length > 0,
        has_brain_intent_or_skip: result.intents.length > 0 || result.events_persisted > result.snapshots.length,
        has_pm_decision: result.decisions.length > 0,
        events_persisted: result.events_persisted,
      });

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
          mock_mode: getOperationalState().mock_mode,
        },
        correlation_id: result.correlation_id,
      });

      return {
        correlation_id: result.correlation_id,
        timestamp: result.timestamp,
        gate: result.gate,
        commands_sent: result.commands_sent,
        events_persisted: result.events_persisted,
        mock_mode: getOperationalState().mock_mode,
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
