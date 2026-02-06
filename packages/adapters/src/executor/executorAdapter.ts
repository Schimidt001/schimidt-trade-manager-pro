// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/adapters — Executor Adapter (Real)
// ═══════════════════════════════════════════════════════════════
// Client HTTP para comunicação com o Schimidt Trader System Pro.
// Implementa timeout curto (3s) e retry limitado (1 retry).
// Em caso de falha, retorna erro claro com reason_code.
//
// Env vars necessárias:
//   EXECUTOR_BASE_URL  — URL base do executor (ex: https://executor.railway.app)
//   EXECUTOR_API_KEY   — API key Bearer para autenticação
// ═══════════════════════════════════════════════════════════════

import type {
  IExecutorAdapter,
  ExecutorStatus,
  ExecutorCommand,
  ExecutorCommandResult,
} from "./types";

// ─── Configuração ──────────────────────────────────────────────

/** Timeout para cada request HTTP em ms */
const REQUEST_TIMEOUT_MS = 3000;

/** Número máximo de retries (0 = sem retry, 1 = 1 retry) */
const MAX_RETRIES = 1;

/** Delay entre retries em ms */
const RETRY_DELAY_MS = 500;

// ─── Helpers ───────────────────────────────────────────────────

function getBaseUrl(): string {
  const url = process.env.EXECUTOR_BASE_URL;
  if (!url) {
    throw new Error("EXECUTOR_BASE_URL não definida");
  }
  // Remover trailing slash
  return url.replace(/\/+$/, "");
}

function getApiKey(): string {
  const key = process.env.EXECUTOR_API_KEY;
  if (!key) {
    throw new Error("EXECUTOR_API_KEY não definida");
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa um fetch com timeout usando AbortController.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Executa um fetch com retry limitado.
 * Retorna a resposta ou lança erro após esgotar retries.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, REQUEST_TIMEOUT_MS);
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Se não é o último attempt, esperar antes de retry
      if (attempt < maxRetries) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError ?? new Error("Fetch falhou após retries");
}

// ─── Adapter Real ──────────────────────────────────────────────

/**
 * Adapter real para comunicação HTTP com o executor.
 * Usa REST API (Railway → Railway) com Bearer token.
 */
export class ExecutorAdapter implements IExecutorAdapter {
  /**
   * Obtém o status atual do executor.
   *
   * Endpoint esperado: GET {EXECUTOR_BASE_URL}/status
   * Headers: Authorization: Bearer {EXECUTOR_API_KEY}
   *
   * @returns ExecutorStatus com dados do executor
   * @throws Error com reason_code se falhar
   */
  async getStatus(): Promise<ExecutorStatus> {
    const baseUrl = getBaseUrl();
    const apiKey = getApiKey();

    try {
      const response = await fetchWithRetry(`${baseUrl}/status`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw Object.assign(
          new Error(
            `Executor retornou HTTP ${response.status}: ${body || response.statusText}`
          ),
          { reason_code: "EXEC_ORDER_FAILED" }
        );
      }

      const data = (await response.json()) as ExecutorStatus;
      return data;
    } catch (err) {
      // Classificar o erro
      if (err instanceof Error && err.name === "AbortError") {
        throw Object.assign(
          new Error(`Executor timeout após ${REQUEST_TIMEOUT_MS}ms`),
          { reason_code: "EXEC_ORDER_TIMEOUT" }
        );
      }

      // Se já tem reason_code, re-throw
      if (err instanceof Error && "reason_code" in err) {
        throw err;
      }

      // Erro de rede / conexão
      throw Object.assign(
        new Error(
          `Falha ao conectar ao executor: ${err instanceof Error ? err.message : String(err)}`
        ),
        { reason_code: "EXEC_BROKEN" }
      );
    }
  }

  /**
   * Envia um comando ao executor.
   *
   * Endpoint esperado: POST {EXECUTOR_BASE_URL}/command
   * Headers: Authorization: Bearer {EXECUTOR_API_KEY}
   * Body: ExecutorCommand (JSON)
   *
   * @param cmd - Comando a enviar
   * @returns ExecutorCommandResult com ok/message
   */
  async sendCommand(cmd: ExecutorCommand): Promise<ExecutorCommandResult> {
    const baseUrl = getBaseUrl();
    const apiKey = getApiKey();

    try {
      const response = await fetchWithRetry(`${baseUrl}/command`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(cmd),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          ok: false,
          message: `Executor retornou HTTP ${response.status}: ${body || response.statusText}`,
          reason_code: "EXEC_ORDER_FAILED",
        };
      }

      const data = (await response.json()) as ExecutorCommandResult;
      return {
        ok: data.ok ?? true,
        message: data.message,
        reason_code: data.reason_code,
      };
    } catch (err) {
      // Timeout
      if (err instanceof Error && err.name === "AbortError") {
        return {
          ok: false,
          message: `Executor timeout após ${REQUEST_TIMEOUT_MS}ms`,
          reason_code: "EXEC_ORDER_TIMEOUT",
        };
      }

      // Erro de rede / conexão
      return {
        ok: false,
        message: `Falha ao enviar comando ao executor: ${err instanceof Error ? err.message : String(err)}`,
        reason_code: "EXEC_BROKEN",
      };
    }
  }
}
