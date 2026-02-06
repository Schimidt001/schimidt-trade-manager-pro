"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/common/Badge";
import { getCurrentTimeBR } from "@/lib/format";
import { getRole, clearApiKey } from "@/lib/auth";
import { onSSEStatus, type SSEStatus } from "@/lib/sse";
import { cn } from "@/lib/utils";

export function TopBar() {
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
      {/* Left: SSE status */}
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
