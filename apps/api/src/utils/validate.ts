// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Validação com schemas do contracts
// ═══════════════════════════════════════════════════════════════

import {
  MclSnapshotSchema,
  BrainIntentSchema,
  PmDecisionSchema,
  EhmActionSchema,
  ExecutionStateChangeSchema,
  ProviderStateChangeSchema,
  AuditLogSchema,
} from "@schimidt-brain/contracts";

/**
 * Mapa de event_type → schema Zod para validação.
 * Usamos Record<string, unknown> para evitar conflitos de tipo entre versões do zod.
 */
const EVENT_SCHEMA_MAP: Record<string, { safeParse: (data: unknown) => { success: boolean; error?: { issues: Array<{ path: Array<string | number>; message: string }> } } }> = {
  MCL_SNAPSHOT: MclSnapshotSchema,
  BRAIN_INTENT: BrainIntentSchema,
  PM_DECISION: PmDecisionSchema,
  EHM_ACTION: EhmActionSchema,
  EXEC_STATE_CHANGE: ExecutionStateChangeSchema,
  PROV_STATE_CHANGE: ProviderStateChangeSchema,
  AUDIT_LOG: AuditLogSchema,
};

/**
 * Valida um payload de evento contra o schema correspondente.
 * Lança erro se a validação falhar.
 *
 * @param eventType - Tipo do evento (ex: MCL_SNAPSHOT)
 * @param payload - JSON do evento
 */
export function validateEventOrThrow(
  eventType: string,
  payload: unknown
): void {
  const schema = EVENT_SCHEMA_MAP[eventType];
  if (!schema) {
    // Tipos sem schema definido (ex: CONFIG_SNAPSHOT) passam sem validação
    return;
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    const issues = result.error?.issues
      .map((i: { path: Array<string | number>; message: string }) => `${i.path.join(".")}: ${i.message}`)
      .join("; ") ?? "Unknown validation error";
    throw new Error(
      `Validação falhou para evento ${eventType}: ${issues}`
    );
  }
}

/**
 * Verifica se um event_type tem schema de validação registrado.
 */
export function hasSchema(eventType: string): boolean {
  return eventType in EVENT_SCHEMA_MAP;
}
