// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Audit Service
// ═══════════════════════════════════════════════════════════════
// Registra audit logs em toda ação humana.
// Persiste via packages/db auditRepo + espelha como ledger_event
// para stream SSE (recomendado para UI).
// ═══════════════════════════════════════════════════════════════

import { insertAuditLog } from "@schimidt-brain/db";
import type { AuditLogInput, AuditAction } from "@schimidt-brain/db";
import { publishAuditEvent } from "./streamService";
import { persistEvent } from "./ledgerService";
import { newEventId } from "../utils/correlation";
import { nowISO } from "../utils/correlation";

export interface RecordAuditParams {
  actor_user_id: string;
  actor_role: string;
  action: AuditAction;
  resource: string;
  reason: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  correlation_id?: string | null;
}

/**
 * Registra um audit log completo.
 *
 * 1. Persiste na tabela audit_logs
 * 2. Espelha como ledger_event (AUDIT_LOG) para stream
 * 3. Faz broadcast SSE do audit
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<string> {
  const auditId = newEventId();
  const timestamp = nowISO();

  const entry: AuditLogInput = {
    audit_id: auditId,
    timestamp,
    actor_user_id: params.actor_user_id,
    actor_role: params.actor_role,
    action: params.action,
    resource: params.resource,
    reason: params.reason,
    before: params.before ?? null,
    after: params.after ?? null,
    correlation_id: params.correlation_id ?? null,
  };

  // 1. Persistir audit log
  await insertAuditLog(entry);

  // 2. Espelhar como ledger_event para stream SSE
  try {
    await persistEvent({
      event_id: auditId,
      correlation_id: params.correlation_id ?? auditId,
      timestamp,
      severity: "INFO",
      event_type: "AUDIT_LOG",
      component: "SYSTEM",
      symbol: null,
      brain_id: null,
      reason_code: null,
      payload: {
        event_id: auditId,
        correlation_id: params.correlation_id ?? auditId,
        timestamp,
        severity: "INFO",
        actor: {
          user: params.actor_user_id,
          role: params.actor_role,
        },
        action: params.action,
        resource: params.resource,
        diff: {
          before: params.before ?? null,
          after: params.after ?? null,
        },
        reason: params.reason,
        reason_code: "AUDIT_CONFIG_CHANGED",
      },
    });
  } catch {
    // Se falhar a espelhagem no ledger, não bloqueia o audit log
    // O audit log já foi persistido na tabela dedicada
  }

  // 3. Broadcast SSE direto
  publishAuditEvent({
    audit_id: auditId,
    timestamp,
    actor_user_id: params.actor_user_id,
    actor_role: params.actor_role,
    action: params.action,
    resource: params.resource,
    reason: params.reason,
    before: params.before ?? null,
    after: params.after ?? null,
    correlation_id: params.correlation_id ?? null,
  });

  return auditId;
}
