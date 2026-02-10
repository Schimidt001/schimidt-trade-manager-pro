"use client";

import { useState } from "react";
import { Badge } from "@/components/common/Badge";
import { JsonCollapse } from "@/components/common/JsonCollapse";
import { cn } from "@/lib/utils";

interface BrainCardProps {
  brainId: string;
  status: string;
  budgetAlloc?: number;
  budgetUsed?: number;
  lastIntent?: {
    type?: string;
    symbol?: string;
    timestamp?: string;
  } | null;
  lastPmDecision?: {
    type?: string;
    reason_code?: string;
    timestamp?: string;
  } | null;
  lastSkip?: {
    reason?: string;
    timestamp?: string;
  } | null;
  blockReasons?: Array<{
    reason_code: string;
    reason: string;
  }>;
  stateCheck?: {
    execution_ok?: boolean;
    event_ok?: boolean;
    exposure_ok?: boolean;
  };
}

function statusVariant(status: string): "success" | "warning" | "danger" | "muted" {
  switch (status?.toUpperCase()) {
    case "ACTIVE":
      return "success";
    case "IDLE":
      return "muted";
    case "COOLDOWN":
      return "warning";
    case "OFF":
      return "danger";
    default:
      return "muted";
  }
}

export function BrainCard({
  brainId,
  status,
  budgetAlloc,
  budgetUsed,
  lastIntent,
  lastPmDecision,
  lastSkip,
  blockReasons,
  stateCheck,
}: BrainCardProps) {
  const [showExplain, setShowExplain] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground font-mono">{brainId}</h3>
        <Badge variant={statusVariant(status)} size="md" pulse={status === "ACTIVE"}>
          {status || "—"}
        </Badge>
      </div>

      {/* Budget */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Budget</span>
          <span>
            {budgetUsed !== undefined && budgetAlloc !== undefined
              ? `${budgetUsed.toFixed(0)} / ${budgetAlloc.toFixed(0)}`
              : "—"}
          </span>
        </div>
        {budgetAlloc !== undefined && budgetUsed !== undefined ? (
          <div className="h-1.5 w-full rounded-full bg-secondary">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                budgetUsed / budgetAlloc > 0.9
                  ? "bg-red-500"
                  : budgetUsed / budgetAlloc > 0.7
                  ? "bg-yellow-500"
                  : "bg-emerald-500"
              )}
              style={{ width: `${Math.min(100, (budgetUsed / budgetAlloc) * 100)}%` }}
            />
          </div>
        ) : (
          <div className="h-1.5 w-full rounded-full bg-secondary" />
        )}
      </div>

      {/* Last events */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Last Intent</span>
          <span className="font-mono text-foreground">
            {lastIntent ? `${lastIntent.type || "—"} ${lastIntent.symbol || ""}` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Last PM</span>
          <span className="font-mono text-foreground">
            {lastPmDecision ? lastPmDecision.type || "—" : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Last Skip</span>
          <span className="font-mono text-foreground text-[10px]">
            {lastSkip ? lastSkip.reason || "—" : "—"}
          </span>
        </div>
      </div>

      {/* Explain button */}
      <button
        onClick={() => setShowExplain(!showExplain)}
        className="mt-3 w-full rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        {showExplain ? "Fechar" : "Explain"}
      </button>

      {/* Explain drawer */}
      {showExplain && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {/* Block reasons */}
          {blockReasons && blockReasons.length > 0 && (
            <div>
              <span className="text-[10px] uppercase text-muted-foreground">Block Reasons</span>
              <div className="mt-1 space-y-1">
                {blockReasons.map((r, i) => (
                  <div key={i} className="rounded bg-red-500/10 border border-red-500/20 px-2 py-1 text-xs">
                    <span className="font-mono text-red-400">{r.reason_code}</span>
                    <span className="text-muted-foreground ml-2">{r.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* State check */}
          {stateCheck && (
            <div>
              <span className="text-[10px] uppercase text-muted-foreground">State Check</span>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">Execution</div>
                  <Badge variant={stateCheck.execution_ok ? "success" : "danger"}>
                    {stateCheck.execution_ok ? "OK" : "FAIL"}
                  </Badge>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">Event</div>
                  <Badge variant={stateCheck.event_ok ? "success" : "danger"}>
                    {stateCheck.event_ok ? "OK" : "FAIL"}
                  </Badge>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">Exposure</div>
                  <Badge variant={stateCheck.exposure_ok ? "success" : "danger"}>
                    {stateCheck.exposure_ok ? "OK" : "FAIL"}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          {/* Raw data */}
          {lastPmDecision && (
            <JsonCollapse data={lastPmDecision} label="Last PM Decision (raw)" />
          )}
        </div>
      )}
    </div>
  );
}
