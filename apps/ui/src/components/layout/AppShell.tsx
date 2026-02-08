"use client";

import { useEffect, useState } from "react";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import { AlertBanner } from "@/components/common/AlertBanner";
import { hasApiKey, setApiKey, setRole, type Role } from "@/lib/auth";
import { connectSSE, disconnectSSE, onSSEStatus, type SSEStatus } from "@/lib/sse";
import { apiGet } from "@/lib/api";

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * AuthGate — se não tiver API key, mostra modal de login.
 */
function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [key, setKey] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("viewer");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError("API key é obrigatória");
      return;
    }
    setLoading(true);
    setError("");

    // Salvar key e role temporariamente para testar
    setApiKey(key.trim());
    setRole(selectedRole);

    try {
      // Testar a key chamando /ops/status
      await apiGet("/ops/status");
      onAuth();
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      if (apiErr?.status === 401 || apiErr?.status === 403) {
        setError("API key inválida ou sem permissão");
      } else {
        // Pode ser que a API esteja offline, mas a key pode estar correta
        // Permitir acesso mesmo assim
        onAuth();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8">
        <h1 className="text-xl font-bold text-foreground">
          SCHIMIDT<span className="text-primary"> BRAIN</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trade Manager — Autenticação
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              API Key
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Insira a API key..."
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as Role)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="viewer">Viewer (leitura)</option>
              <option value="operator">Operator (operação)</option>
              <option value="admin">Admin (total)</option>
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [sseStatus, setSseStatus] = useState<SSEStatus>("disconnected");
  const [mounted, setMounted] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [executorMode, setExecutorMode] = useState<string | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
    if (hasApiKey()) {
      setAuthenticated(true);
    }
  }, []);

  // Conectar SSE quando autenticado
  useEffect(() => {
    if (authenticated) {
      connectSSE();
      const unsub = onSSEStatus((status) => setSseStatus(status));
      return () => {
        unsub();
        disconnectSSE();
      };
    }
  }, [authenticated]);

  // Fetch ops/status para mock_mode e executor_mode
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const data = await apiGet("/ops/status") as {
          mock_mode?: boolean;
          executor_status?: { mode?: string };
        };
        if (!cancelled) {
          setMockMode(!!data.mock_mode);
          setExecutorMode(data.executor_status?.mode);
        }
      } catch { /* ignore */ }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [authenticated]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <AuthGate onAuth={() => setAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SideNav />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar mockMode={mockMode} executorMode={executorMode} />
        {/* SSE disconnected banner */}
        {(sseStatus === "error" || sseStatus === "disconnected") && (
          <AlertBanner variant="warning" className="mx-4 mt-2">
            Realtime disconnected — dados via REST (polling a cada 15s)
          </AlertBanner>
        )}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
