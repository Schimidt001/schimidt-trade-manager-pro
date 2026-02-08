// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Server Entry Point (Fastify)
// ═══════════════════════════════════════════════════════════════

import Fastify from "fastify";
import { getConfig } from "./config/env";
import { authHook } from "./auth/authMiddleware";
import { registerHealthRoutes } from "./routes/health.routes";
import { registerOpsRoutes } from "./routes/ops.routes";
import { registerConfigRoutes } from "./routes/config.routes";
import { registerDecisionsRoutes } from "./routes/decisions.routes";
import { registerReplayRoutes } from "./routes/replay.routes";
import { registerAuditRoutes } from "./routes/audit.routes";
import { registerStreamRoutes } from "./routes/stream.routes";
import { registerExecutorRoutes } from "./routes/executor.routes";
import { closePool } from "@schimidt-brain/db";

const startTime = Date.now();

export function getUptime(): number {
  return Math.floor((Date.now() - startTime) / 1000);
}

async function main(): Promise<void> {
  const config = getConfig();

  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      transport:
        config.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  // ─── CORS (manual — sem dependência extra) ─────────────────
  app.addHook("onRequest", (request, reply, done) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    reply.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    reply.header("Access-Control-Max-Age", "86400");

    // Preflight
    if (request.method === "OPTIONS") {
      reply.code(204).send();
      return;
    }

    done();
  });

  // ─── Auth hook global (exceto /health) ──────────────────────
  app.addHook("onRequest", authHook);

  // ─── Registrar rotas ────────────────────────────────────────
  await registerHealthRoutes(app);
  await registerOpsRoutes(app);
  await registerConfigRoutes(app);
  await registerDecisionsRoutes(app);
  await registerReplayRoutes(app);
  await registerAuditRoutes(app);
  await registerStreamRoutes(app);
  await registerExecutorRoutes(app);

  // ─── Graceful shutdown ──────────────────────────────────────
  const shutdown = async (): Promise<void> => {
    app.log.info("Shutting down gracefully...");
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // ─── Start ──────────────────────────────────────────────────
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(
    `@schimidt-brain/api running on port ${config.PORT} (${config.NODE_ENV})`
  );
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
