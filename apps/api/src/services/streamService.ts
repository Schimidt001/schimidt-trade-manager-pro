// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Stream Service (SSE Broadcast)
// ═══════════════════════════════════════════════════════════════
// Gerencia múltiplos clientes SSE e faz broadcast de eventos
// recém gravados no ledger.
// ═══════════════════════════════════════════════════════════════

import type { ServerResponse } from "http";

/** Clientes SSE conectados */
const clients: Set<ServerResponse> = new Set();

/**
 * Registra um novo cliente SSE.
 */
export function addClient(res: ServerResponse): void {
  clients.add(res);
  res.on("close", () => {
    clients.delete(res);
  });
}

/**
 * Remove um cliente SSE.
 */
export function removeClient(res: ServerResponse): void {
  clients.delete(res);
}

/**
 * Retorna o número de clientes SSE conectados.
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * Envia um evento SSE para todos os clientes conectados.
 *
 * Formato SSE:
 *   event: <eventName>
 *   data: <json>
 *
 * @param eventName - Nome do evento SSE (ex: "ledger", "audit")
 * @param data - Dados a enviar (será serializado como JSON)
 */
export function broadcast(eventName: string, data: unknown): void {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    try {
      if (!client.destroyed) {
        client.write(payload);
      } else {
        clients.delete(client);
      }
    } catch {
      clients.delete(client);
    }
  }
}

/**
 * Publica um evento de ledger no stream SSE.
 * Chamado pelo ledgerService após persistir.
 */
export function publishLedgerEvent(event: Record<string, unknown>): void {
  broadcast("ledger", event);
}

/**
 * Publica um evento de audit no stream SSE.
 * Chamado pelo auditService após persistir.
 */
export function publishAuditEvent(event: Record<string, unknown>): void {
  broadcast("audit", event);
}
