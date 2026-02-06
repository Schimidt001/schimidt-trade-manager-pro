// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Auth Middleware (API Key + Role Injection)
// ═══════════════════════════════════════════════════════════════
// Header: Authorization: Bearer <api_key>
// Injeta role no request para uso nos handlers.
// /health é público (sem auth).
// ═══════════════════════════════════════════════════════════════

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { getConfig } from "../config/env";
import type { Role } from "./rbac";

// ─── Augment Fastify Request ────────────────────────────────────
declare module "fastify" {
  interface FastifyRequest {
    userRole?: Role;
    userId?: string;
  }
}

/** Rotas públicas (sem auth) */
const PUBLIC_PATHS = ["/health"];

/**
 * Fastify onRequest hook para autenticação.
 */
export function authHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  // Rotas públicas
  if (PUBLIC_PATHS.some((p) => request.url.startsWith(p))) {
    done();
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Header Authorization: Bearer <api_key> obrigatório",
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  const config = getConfig();

  // Mapear token → role
  if (token === config.API_KEY_ADMIN) {
    request.userRole = "admin";
    request.userId = "admin";
  } else if (token === config.API_KEY_OPERATOR) {
    request.userRole = "operator";
    request.userId = "operator";
  } else if (token === config.API_KEY_VIEWER) {
    request.userRole = "viewer";
    request.userId = "viewer";
  } else {
    reply.code(403).send({
      error: "Forbidden",
      message: "API key inválida",
    });
    return;
  }

  done();
}
