"use client";

import { Badge } from "@/components/common/Badge";

interface ExecutionQualityCardProps {
  data: {
    spread?: number;
    slippage?: number;
    requotes?: number;
    reason?: string;
    health?: string;
  } | null;
}

export function ExecutionQualityCard({ data }: ExecutionQualityCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">
        Execution Quality
      </h3>

      {!data ? (
        <p className="text-sm text-muted-foreground">Aguardando dados...</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Health</span>
            <Badge
              variant={
                data.health === "OK" ? "success" : data.health === "DEGRADED" ? "warning" : "danger"
              }
            >
              {data.health || "—"}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Spread</span>
            <span className="text-sm font-mono text-foreground">
              {data.spread !== undefined ? data.spread.toFixed(1) : "—"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Slippage</span>
            <span className="text-sm font-mono text-foreground">
              {data.slippage !== undefined ? data.slippage.toFixed(2) : "—"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Requotes</span>
            <span className="text-sm font-mono text-foreground">
              {data.requotes ?? "—"}
            </span>
          </div>

          {data.reason && (
            <div className="border-t border-border pt-2">
              <span className="text-[10px] text-muted-foreground">Reason</span>
              <p className="mt-1 text-xs text-foreground">{data.reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
