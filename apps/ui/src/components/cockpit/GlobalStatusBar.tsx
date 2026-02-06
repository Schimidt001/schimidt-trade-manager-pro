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
}

function armVariant(state: string): "success" | "danger" | "warning" | "muted" {
  switch (state) {
    case "ARMED":
      return "success";
    case "DISARMED":
      return "danger";
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

export function GlobalStatusBar({
  armState,
  gate,
  globalMode,
  executionState,
  providerStates,
  executorConnectivity,
}: GlobalStatusBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      {/* ARM State */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground">System</span>
        <Badge variant={armVariant(armState)} size="md" pulse={armState === "ARMED"}>
          {armState || "—"}
        </Badge>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Gate */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground">Gate</span>
        <Badge variant={gateVariant(gate)} size="md">
          {gate || "—"}
        </Badge>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Global Mode */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground">Mode</span>
        <Badge variant={modeVariant(globalMode)} size="md">
          {globalMode || "—"}
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

      {/* Providers */}
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

      {/* Executor */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground">Executor</span>
        <StatusDot
          status={providerStatus(executorConnectivity)}
          label={executorConnectivity || "unknown"}
        />
      </div>
    </div>
  );
}
