// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Health Routes
// ═══════════════════════════════════════════════════════════════

import type { FastifyInstance } from "fastify";
import { getConfig } from "../config/env";
import { getUptime } from "../server";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /health
   * Público (sem auth). Retorna status, versão e uptime.
   */
  app.get("/health", async (_request, _reply) => {
    const config = getConfig();
    return {
      status: "OK",
      version: config.BUILD_VERSION,
      uptime_seconds: getUptime(),
      timestamp: new Date().toISOString(),
    };
  });
}
