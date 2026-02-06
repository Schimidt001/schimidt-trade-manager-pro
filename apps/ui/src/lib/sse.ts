// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/ui — SSE Client
// ═══════════════════════════════════════════════════════════════
// Conecta em GET /stream/events com reconexão automática.
// Publica eventos para a UI via callbacks.
// ═══════════════════════════════════════════════════════════════

import { sseUrl } from "./api";
import { getApiKey } from "./auth";

export type SSEStatus = "connecting" | "connected" | "disconnected" | "error";

export interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

type SSEListener = (event: SSEEvent) => void;
type SSEStatusListener = (status: SSEStatus) => void;

let eventSource: EventSource | null = null;
let listeners: SSEListener[] = [];
let statusListeners: SSEStatusListener[] = [];
let currentStatus: SSEStatus = "disconnected";
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;

function setStatus(status: SSEStatus) {
  currentStatus = status;
  statusListeners.forEach((fn) => fn(status));
}

function getReconnectDelay(): number {
  const delay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY
  );
  return delay;
}

export function connectSSE(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    setStatus("disconnected");
    return;
  }

  setStatus("connecting");

  // EventSource não suporta headers customizados nativamente.
  // Passamos o token como query param (a API aceita Bearer no header,
  // mas para SSE usamos esta abordagem).
  const url = sseUrl(`/stream/events?token=${encodeURIComponent(apiKey)}`);

  try {
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      reconnectAttempts = 0;
      setStatus("connected");
    };

    // Eventos tipados
    eventSource.addEventListener("connected", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        notifyListeners({ type: "connected", data, timestamp: data.timestamp });
      } catch { /* ignore parse errors */ }
    });

    eventSource.addEventListener("ledger", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        notifyListeners({ type: "ledger", data, timestamp: data.timestamp || new Date().toISOString() });
      } catch { /* ignore */ }
    });

    eventSource.addEventListener("audit", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        notifyListeners({ type: "audit", data, timestamp: data.timestamp || new Date().toISOString() });
      } catch { /* ignore */ }
    });

    eventSource.addEventListener("ping", () => {
      // Keepalive — no action needed
    });

    // Fallback para mensagens sem tipo
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        notifyListeners({ type: "message", data, timestamp: new Date().toISOString() });
      } catch { /* ignore */ }
    };

    eventSource.onerror = () => {
      setStatus("error");
      eventSource?.close();
      eventSource = null;
      scheduleReconnect();
    };
  } catch {
    setStatus("error");
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = getReconnectDelay();
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    connectSSE();
  }, delay);
}

export function disconnectSSE(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  reconnectAttempts = 0;
  setStatus("disconnected");
}

function notifyListeners(event: SSEEvent): void {
  listeners.forEach((fn) => fn(event));
}

export function onSSEEvent(listener: SSEListener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function onSSEStatus(listener: SSEStatusListener): () => void {
  statusListeners.push(listener);
  // Immediately notify current status
  listener(currentStatus);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener);
  };
}

export function getSSEStatus(): SSEStatus {
  return currentStatus;
}
