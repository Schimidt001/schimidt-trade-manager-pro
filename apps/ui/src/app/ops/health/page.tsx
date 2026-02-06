"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Badge, StatusDot } from "@/components/common/Badge";
import { JsonCollapse } from "@/components/common/JsonCollapse";
import { formatTime, severityBgColor } from "@/lib/format";
import { onSSEStatus, getSSEStatus, type SSEStatus } from "@/lib/sse";
import { cn } from "@/lib/utils";

interface OpsStatus {
  gate: string;
  arm_state: string;
  global_mode: string;
  execution_state: string;
  provider_states: Record<string, string>;
  executor_connectivity: string;
}

interface HealthResponse {
  status: string;
  uptime?: number;
  version?: string;
  timestamp?: string;
}

export default function OpsHealthPage() {
  const [sseStatus, setSseStatus] = useState<SSEStatus>(getSSEStatus());

  useEffect(() => {
    const unsub = onSSEStatus((status) => setSseStatus(status));
    return unsub;
  }, []);

  const { data: opsStatus } = useQuery<OpsStatus>({
    queryKey: ["ops-status-health"],
    queryFn: () => apiGet<OpsStatus>("/ops/status"),
    refetchInterval: 10_000,
  });

  const { data: health } = useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthResponse>("/health"),
    refetchInterval: 30_000,
  });

  // Fetch recent errors
  const { data: recentLogs } = useQuery({
    queryKey: ["logs-errors"],
    queryFn: () =>
      apiGet<{ events: Array<Record<string, unknown>> }>("/decisions/tail", {
        limit: "100",
      }),
    refetchInterval: 30_000,
  });

  const errors = (recentLogs?.events || []).filter(
    (e) => (e.severity as string)?.toUpperCase() === "ERROR"
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Ops / Health</h1>
        <p className="text-sm text-muted-foreground">
          Status de infraestrutura, provedores, executor e SSE.
        </p>
      </div>

      {/* System Health */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* API Health */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">API</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <Badge variant={health?.status === "ok" ? "success" : "danger"}>
                {health?.status || "—"}
              </Badge>
            </div>
            {health?.uptime !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Uptime</span>
                <span className="text-xs font-mono text-foreground">
                  {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m
                </span>
              </div>
            )}
            {health?.version && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Version</span>
                <span className="text-xs font-mono text-foreground">{health.version}</span>
              </div>
            )}
          </div>
        </div>

        {/* Gate */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">Gate</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Level</span>
              <Badge
                variant={
                  opsStatus?.gate === "G3"
                    ? "success"
                    : opsStatus?.gate === "G2"
                    ? "warning"
                    : opsStatus?.gate === "G1"
                    ? "info"
                    : "muted"
                }
                size="md"
              >
                {opsStatus?.gate || "—"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Arm State</span>
              <Badge
                variant={opsStatus?.arm_state === "ARMED" ? "success" : "danger"}
                size="md"
              >
                {opsStatus?.arm_state || "—"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Mode</span>
              <Badge
                variant={opsStatus?.global_mode === "NORMAL" ? "success" : "warning"}
              >
                {opsStatus?.global_mode || "—"}
              </Badge>
            </div>
          </div>
        </div>

        {/* SSE */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">SSE Stream</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    sseStatus === "connected"
                      ? "bg-emerald-400"
                      : sseStatus === "connecting"
                      ? "bg-yellow-400 animate-pulse"
                      : "bg-red-400"
                  )}
                />
                <span className="text-xs text-foreground capitalize">{sseStatus}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Executor */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">Executor</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Connectivity</span>
              <StatusDot
                status={
                  opsStatus?.executor_connectivity === "connected"
                    ? "ok"
                    : opsStatus?.executor_connectivity === "degraded"
                    ? "warn"
                    : opsStatus?.executor_connectivity === "disconnected"
                    ? "error"
                    : "unknown"
                }
                label={opsStatus?.executor_connectivity || "unknown"}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Execution</span>
              <Badge
                variant={
                  opsStatus?.execution_state === "OK"
                    ? "success"
                    : opsStatus?.execution_state === "DEGRADED"
                    ? "warning"
                    : "danger"
                }
              >
                {opsStatus?.execution_state || "—"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Provider Status */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">
          Provider Status
        </h3>
        {opsStatus?.provider_states &&
        Object.keys(opsStatus.provider_states).length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(opsStatus.provider_states).map(([name, state]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded border border-border px-4 py-3"
              >
                <span className="text-sm text-foreground">{name}</span>
                <StatusDot
                  status={
                    state === "HEALTHY" || state === "OK"
                      ? "ok"
                      : state === "DEGRADED"
                      ? "warn"
                      : state === "DOWN"
                      ? "error"
                      : "unknown"
                  }
                  label={state}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sem dados de provedores</p>
        )}
      </div>

      {/* Recent Errors */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">
          Últimos Erros ({errors.length})
        </h3>
        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Sem erros recentes
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {errors.slice(0, 20).map((err, i) => (
              <div
                key={i}
                className="rounded border border-red-500/20 bg-red-500/5 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-muted-foreground">
                    [{formatTime((err.timestamp as string) || "")}]
                  </span>
                  <Badge className={severityBgColor("ERROR")}>ERROR</Badge>
                  <span className="text-xs text-foreground">
                    {(err.event_type as string) || "—"}
                  </span>
                </div>
                {err.reason ? (
                  <p className="text-xs text-muted-foreground">{String(err.reason)}</p>
                ) : null}
                <JsonCollapse data={err} label="Details" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raw ops status */}
      {opsStatus && (
        <JsonCollapse data={opsStatus} label="Raw /ops/status" />
      )}
    </div>
  );
}
