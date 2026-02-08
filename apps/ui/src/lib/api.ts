// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/ui — API Client
// ═══════════════════════════════════════════════════════════════
// Cliente HTTP central. Todas as chamadas à API passam por aqui.
// Injeta Authorization: Bearer <key> automaticamente.
//
// REGRA OBRIGATÓRIA: Usar EXCLUSIVAMENTE NEXT_PUBLIC_API_BASE_URL.
// Nunca usar window.location.origin ou URL da própria UI.
// ═══════════════════════════════════════════════════════════════

import { getApiKey } from "./auth";

// CORREÇÃO: Usar EXCLUSIVAMENTE NEXT_PUBLIC_API_BASE_URL
// Fallback para localhost:3000 apenas em desenvolvimento.
// Em produção, a variável DEVE estar definida.
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

// Emitir warning se a variável não estiver definida (indica configuração incorreta)
if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_API_BASE_URL) {
  console.warn(
    "[schimidt-brain/ui] NEXT_PUBLIC_API_BASE_URL não definida. " +
    "Usando fallback http://localhost:3000. " +
    "Em produção, defina esta variável para apontar para a API correta."
  );
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown
  ) {
    super(`API ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

function headers(): HeadersInit {
  const h: HeadersInit = {
    "Content-Type": "application/json",
  };
  const key = getApiKey();
  if (key) {
    h["Authorization"] = `Bearer ${key}`;
  }
  return h;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new ApiError(res.status, res.statusText, body);
  }
  return res.json() as Promise<T>;
}

// ─── GET ──────────────────────────────────────────────────────
export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), { headers: headers() });
  return handleResponse<T>(res);
}

// ─── POST ─────────────────────────────────────────────────────
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

// ─── PUT ──────────────────────────────────────────────────────
export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

// ─── DELETE ───────────────────────────────────────────────────
export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: headers(),
  });
  return handleResponse<T>(res);
}

// ─── Download (blob) ──────────────────────────────────────────
export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers() });
  if (!res.ok) throw new ApiError(res.status, res.statusText, null);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── SSE URL builder ──────────────────────────────────────────
export function sseUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

export { BASE_URL };
