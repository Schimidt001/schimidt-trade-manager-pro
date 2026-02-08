// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/api — Auth Middleware (API Key + Role Injection)
// ═══════════════════════════════════════════════════════════════
// Header: Authorization: Bearer <api_key>
// Fallback: ?token=<api_key> (para SSE/EventSource)
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
 * Extrai o token de autenticação do request.
 * Prioridade: header Authorization > query parameter token.
 * O fallback via query param é necessário para SSE (EventSource
 * não suporta headers customizados).
 */
function extractToken(request: FastifyRequest): string | null {
  // 1. Header Authorization: Bearer <token>
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  // 2. Query parameter ?token=<token> (fallback para SSE)
  const query = request.query as { token?: string };
  if (query.token && typeof query.token === "string") {
    return query.token.trim();
  }

  return null;
}

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

  const token = extractToken(request);
  if (!token) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Header Authorization: Bearer <api_key> obrigatório",
    });
    return;
  }

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
