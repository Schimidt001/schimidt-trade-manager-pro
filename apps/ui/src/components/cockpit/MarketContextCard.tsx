"use client";

import { Badge } from "@/components/common/Badge";
import { formatTime } from "@/lib/format";

interface MarketContextCardProps {
  mcl: {
    timestamp?: string;
    states?: {
      market_structure?: string;
      volatility?: string;
      liquidity_phase?: string;
      session?: string;
      event_proximity?: string;
    };
    metrics?: {
      spread_quality?: number;
      volume_ratio?: number;
      atr_percentile?: number;
    };
    global_mode?: string;
  } | null;
}

function metricVariant(value: number | undefined, thresholds: [number, number]): "success" | "warning" | "danger" | "muted" {
  if (value === undefined || value === null) return "muted";
  if (value >= thresholds[1]) return "success";
  if (value >= thresholds[0]) return "warning";
  return "danger";
}

export function MarketContextCard({ mcl }: MarketContextCardProps) {
  if (!mcl) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">Market Context (MCL)</h3>
        <p className="text-sm text-muted-foreground">Aguardando dados...</p>
      </div>
    );
  }

  const states = mcl.states || {};
  const metrics = mcl.metrics || {};

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">Market Context (MCL)</h3>
        {mcl.timestamp && (
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            {formatTime(mcl.timestamp)}
          </span>
        )}
      </div>

      {/* States */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <span className="text-[10px] text-muted-foreground">Structure</span>
          <div className="mt-0.5">
            <Badge variant={states.market_structure === "TREND" ? "success" : states.market_structure === "RANGE" ? "info" : "warning"}>
              {states.market_structure || "—"}
            </Badge>
          </div>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">Volatility</span>
          <div className="mt-0.5">
            <Badge variant={states.volatility === "NORMAL" ? "success" : states.volatility === "HIGH" ? "danger" : "info"}>
              {states.volatility || "—"}
            </Badge>
          </div>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">Liquidity</span>
          <div className="mt-0.5">
            <Badge variant={states.liquidity_phase === "CLEAN" ? "success" : states.liquidity_phase === "RAID" ? "danger" : "warning"}>
              {states.liquidity_phase || "—"}
            </Badge>
          </div>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">Session</span>
          <div className="mt-0.5">
            <Badge>{states.session || "—"}</Badge>
          </div>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">Event Proximity</span>
          <div className="mt-0.5">
            <Badge variant={states.event_proximity === "NONE" ? "muted" : "warning"}>
              {states.event_proximity || "—"}
            </Badge>
          </div>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground">Global Mode</span>
          <div className="mt-0.5">
            <Badge variant={mcl.global_mode === "NORMAL" ? "success" : "warning"}>
              {mcl.global_mode || "—"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="border-t border-border pt-3">
        <span className="text-[10px] text-muted-foreground uppercase">Metrics</span>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">Spread</div>
            <Badge variant={metricVariant(metrics.spread_quality, [0.3, 0.7])} size="md">
              {metrics.spread_quality?.toFixed(2) ?? "—"}
            </Badge>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">Volume</div>
            <Badge variant={metricVariant(metrics.volume_ratio, [0.5, 1.0])} size="md">
              {metrics.volume_ratio?.toFixed(2) ?? "—"}
            </Badge>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground">ATR %ile</div>
            <Badge variant={metricVariant(metrics.atr_percentile, [25, 75])} size="md">
              {metrics.atr_percentile?.toFixed(0) ?? "—"}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
