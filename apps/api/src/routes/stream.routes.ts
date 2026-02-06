// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Stream Routes (SSE)
// ═══════════════════════════════════════════════════════════════
// GET /stream/events — Server-Sent Events
// Requer: Viewer+
// Envia eventos do ledger e audit em tempo real.
// Se cliente cair, reconecta e usa /decisions/tail para recuperar.
// ═══════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyReply } from "fastify";
import { addClient, getClientCount } from "../services/streamService";

export async function registerStreamRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /stream/events
   * SSE endpoint — envia eventos em tempo real.
   * Requer: Viewer+
   *
   * Eventos SSE:
   *   event: ledger   → evento do ledger (MCL, INTENT, PM, etc.)
   *   event: audit    → audit log
   *   event: ping     → keepalive (a cada 30s)
   */
  app.get("/stream/events", async (_request, reply: FastifyReply) => {
    // SSE headers
    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });

    // Enviar comentário inicial (para flush)
    raw.write(": connected to @schimidt-brain/api SSE stream\n\n");

    // Enviar evento de conexão
    raw.write(`event: connected\ndata: ${JSON.stringify({
      message: "SSE stream connected",
      timestamp: new Date().toISOString(),
      clients: getClientCount() + 1,
    })}\n\n`);

    // Registrar cliente
    addClient(raw);

    // Keepalive ping a cada 30 segundos
    const pingInterval = setInterval(() => {
      try {
        if (!raw.destroyed) {
          raw.write(`event: ping\ndata: ${JSON.stringify({
            timestamp: new Date().toISOString(),
            clients: getClientCount(),
          })}\n\n`);
        } else {
          clearInterval(pingInterval);
        }
      } catch {
        clearInterval(pingInterval);
      }
    }, 30000);

    // Cleanup ao desconectar
    raw.on("close", () => {
      clearInterval(pingInterval);
    });

    // Não fechar a reply — SSE mantém conexão aberta
    // Fastify precisa saber que já respondemos
    reply.hijack();
  });

  /**
   * GET /stream/status
   * Retorna informações sobre o stream SSE.
   * Requer: Viewer+
   */
  app.get("/stream/status", async (_request, _reply) => {
    return {
      connected_clients: getClientCount(),
      timestamp: new Date().toISOString(),
    };
  });
}
