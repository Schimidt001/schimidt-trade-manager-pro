"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/common/Badge";
import { getCurrentTimeBR } from "@/lib/format";
import { getRole, clearApiKey } from "@/lib/auth";
import { onSSEStatus, type SSEStatus } from "@/lib/sse";
import { cn } from "@/lib/utils";

interface TopBarProps {
  mockMode?: boolean;
  executorMode?: string;
}

export function TopBar({ mockMode, executorMode }: TopBarProps) {
  const [time, setTime] = useState("--:--:--");
  const [sseStatus, setSseStatus] = useState<SSEStatus>("disconnected");
  const [role, setRole] = useState("viewer");

  useEffect(() => {
    setRole(getRole());
    const timer = setInterval(() => {
      setTime(getCurrentTimeBR());
    }, 1000);
    setTime(getCurrentTimeBR());

    const unsub = onSSEStatus((status) => setSseStatus(status));

    return () => {
      clearInterval(timer);
      unsub();
    };
  }, []);

  const handleLogout = () => {
    clearApiKey();
    window.location.reload();
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/50 px-6">
      {/* Left: SSE status + MOCK badge */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              sseStatus === "connected" && "bg-emerald-400",
              sseStatus === "connecting" && "bg-yellow-400 animate-pulse",
              sseStatus === "disconnected" && "bg-gray-400",
              sseStatus === "error" && "bg-red-400 animate-pulse"
            )}
          />
          <span className="text-xs text-muted-foreground">
            {sseStatus === "connected" && "Realtime"}
            {sseStatus === "connecting" && "Connecting..."}
            {sseStatus === "disconnected" && "Disconnected"}
            {sseStatus === "error" && "Realtime disconnected"}
          </span>
        </div>

        {/* Entrega B/D: Badge MOCK explícito e impossível de confundir */}
        {mockMode && (
          <span
            title="MOCK MODE: Dados de mercado são simulados (sem provider real). Todos os eventos são marcados com mock=true. Não confundir com operação real."
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-400 animate-pulse"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            MOCK
          </span>
        )}

        {/* Executor mode badge */}
        {executorMode && (
          <Badge
            variant={
              executorMode.toUpperCase() === "SIMULATOR" || executorMode.toUpperCase() === "SIM"
                ? "warning"
                : executorMode.toUpperCase() === "REAL" || executorMode.toUpperCase() === "LIVE"
                ? "success"
                : "muted"
            }
          >
            {executorMode.toUpperCase()}
          </Badge>
        )}
      </div>

      {/* Right: Clock + Role + Logout */}
      <div className="flex items-center gap-4">
        <span className="font-mono text-sm text-muted-foreground">
          {time} <span className="text-[10px] text-muted-foreground/60">UTC-3</span>
        </span>

        <Badge
          variant={
            role === "admin"
              ? "danger"
              : role === "operator"
              ? "warning"
              : "muted"
          }
        >
          {role.toUpperCase()}
        </Badge>

        <button
          onClick={handleLogout}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Sair"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </header>
  );
}
