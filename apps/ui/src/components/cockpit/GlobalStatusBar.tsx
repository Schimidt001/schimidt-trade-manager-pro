"use client";

import { Badge, StatusDot } from "@/components/common/Badge";
import { cn } from "@/lib/utils";

interface GlobalStatusBarProps {
  armState: string;
  gate: string;
  globalMode: string;
  executionState: string;
  providerStates: Record<string, string>;
  executorConnectivity: string;
  executorMode?: string;
  nextScheduledRun?: string;
  mockMode?: boolean;
  riskOff?: boolean;
}

function armVariant(state: string): "success" | "danger" | "warning" | "muted" {
  switch (state) {
    case "ARMED":
      return "success";
    case "DISARMED":
      return "danger";
    case "SHADOW":
      return "warning";
    default:
      return "muted";
  }
}

function gateVariant(gate: string): "success" | "warning" | "info" | "muted" {
  switch (gate) {
    case "G3":
      return "success";
    case "G2":
      return "warning";
    case "G1":
      return "info";
    case "G0":
    default:
      return "muted";
  }
}

function modeVariant(mode: string): "success" | "warning" | "danger" | "muted" {
  switch (mode) {
    case "NORMAL":
      return "success";
    case "RISK_OFF":
      return "danger";
    case "NEWS_ONLY":
      return "warning";
    default:
      return "muted";
  }
}

function providerStatus(state: string): "ok" | "warn" | "error" | "unknown" {
  switch (state?.toUpperCase()) {
    case "HEALTHY":
    case "OK":
    case "CONNECTED":
      return "ok";
    case "DEGRADED":
    case "SLOW":
      return "warn";
    case "DOWN":
    case "ERROR":
    case "DISCONNECTED":
      return "error";
    default:
      return "unknown";
  }
}

function executorModeVariant(mode: string): "success" | "warning" | "muted" {
  switch (mode?.toUpperCase()) {
    case "REAL":
    case "LIVE":
      return "success";
    case "SIMULATOR":
    case "SIM":
    case "PAPER":
      return "warning";
    default:
      return "muted";
  }
}

export function GlobalStatusBar({
  armState,
  gate,
  globalMode,
  executionState,
  providerStates,
  executorConnectivity,
  executorMode,
  nextScheduledRun,
  mockMode,
  riskOff,
}: GlobalStatusBarProps) {
  // Derive executor mode label
  const executorModeLabel = executorMode
    ? executorMode.toUpperCase()
    : executorConnectivity === "connected"
    ? "—"
    : "—";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      {/* ARM State — SYSTEM: ARMED / DISARMED / SHADOW */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground">System</span>
        <Badge variant={armVariant(armState)} size="md" pulse={armState === "ARMED"}>
          {armState || "—"}
        </Badge>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Gate: G0–G3 */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground">Gate</span>
        <Badge variant={gateVariant(gate)} size="md">
          {gate || "—"}
        </Badge>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Execution State */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground">Execution</span>
        <Badge
          variant={executionState === "OK" ? "success" : executionState === "DEGRADED" ? "warning" : "danger"}
          size="md"
        >
          {executionState || "—"}
        </Badge>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Executor status (Simulator / Real) — Seção 4 diretriz */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground">Executor</span>
        <StatusDot
          status={providerStatus(executorConnectivity)}
          label={executorConnectivity || "unknown"}
        />
        <span title="Modo do executor: Simulator (paper trading) ou Real (live trading)">
          <Badge
            variant={executorModeVariant(executorMode || "")}
            size="sm"
          >
            {executorMode ? executorMode.toUpperCase() : "—"}
          </Badge>
        </span>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Provider News status */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] uppercase text-muted-foreground">Providers</span>
        {Object.keys(providerStates).length > 0 ? (
          Object.entries(providerStates).map(([name, state]) => (
            <StatusDot
              key={name}
              status={providerStatus(state)}
              label={name}
            />
          ))
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Global Mode */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground">Mode</span>
        <Badge variant={modeVariant(globalMode)} size="md">
          {globalMode || "—"}
        </Badge>
      </div>

      {/* Mock Mode indicator */}
      {mockMode && (
        <>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 animate-pulse"
              title="MOCK MODE: Dados de mercado são simulados. Todos os eventos estão marcados com mock=true."
            >
              MOCK
            </span>
          </div>
        </>
      )}

      {/* Risk Off indicator */}
      {riskOff && (
        <>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded border border-red-500/50 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 animate-pulse"
              title="RISK OFF: Kill switch ativado. Sistema desarmado e em modo de proteção."
            >
              RISK OFF
            </span>
          </div>
        </>
      )}

      <div className="h-6 w-px bg-border" />

      {/* Próxima execução (scheduler) — Seção 4 diretriz */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground">Next Run</span>
        <span
          className="text-xs font-mono text-muted-foreground"
          title="Próxima execução agendada pelo scheduler. Se vazio, sem agendamento ativo."
        >
          {nextScheduledRun || "—"}
        </span>
      </div>
    </div>
  );
}
