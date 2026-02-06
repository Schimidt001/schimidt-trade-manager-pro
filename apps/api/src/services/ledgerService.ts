// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Ledger Service
// ═══════════════════════════════════════════════════════════════
// Camada de serviço sobre packages/db ledgerRepo.
// Valida payload → persiste → emite no stream SSE.
// ═══════════════════════════════════════════════════════════════

import {
  insertEvent,
  insertEvents,
} from "@schimidt-brain/db";
import type { LedgerEventInput } from "@schimidt-brain/db";
import { validateEventOrThrow } from "../utils/validate";
import { publishLedgerEvent } from "./streamService";

/**
 * Persiste um evento no ledger com validação e broadcast SSE.
 *
 * 1. Valida payload contra schema do contracts
 * 2. Insere no DB (idempotente por event_id)
 * 3. Faz broadcast SSE para clientes conectados
 *
 * @returns true se inseriu, false se já existia
 */
export async function persistEvent(event: LedgerEventInput): Promise<boolean> {
  // 1. Validar payload
  validateEventOrThrow(event.event_type, event.payload);

  // 2. Persistir
  const inserted = await insertEvent(event);

  // 3. Broadcast SSE (mesmo que já existisse, para garantir entrega)
  if (inserted) {
    publishLedgerEvent({
      event_id: event.event_id,
      correlation_id: event.correlation_id,
      timestamp: event.timestamp,
      severity: event.severity,
      event_type: event.event_type,
      component: event.component,
      symbol: event.symbol ?? null,
      brain_id: event.brain_id ?? null,
      reason_code: event.reason_code ?? null,
      payload: event.payload,
    });
  }

  return inserted;
}

/**
 * Persiste múltiplos eventos em batch com validação e broadcast.
 *
 * @returns Número de eventos efetivamente inseridos
 */
export async function persistEvents(events: LedgerEventInput[]): Promise<number> {
  // 1. Validar todos os payloads
  for (const event of events) {
    validateEventOrThrow(event.event_type, event.payload);
  }

  // 2. Persistir batch
  const count = await insertEvents(events);

  // 3. Broadcast SSE para cada evento inserido
  for (const event of events) {
    publishLedgerEvent({
      event_id: event.event_id,
      correlation_id: event.correlation_id,
      timestamp: event.timestamp,
      severity: event.severity,
      event_type: event.event_type,
      component: event.component,
      symbol: event.symbol ?? null,
      brain_id: event.brain_id ?? null,
      reason_code: event.reason_code ?? null,
      payload: event.payload,
    });
  }

  return count;
}
