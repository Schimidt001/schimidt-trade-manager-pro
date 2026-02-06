"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Badge } from "@/components/common/Badge";
import { AlertBanner } from "@/components/common/AlertBanner";
import { cn } from "@/lib/utils";

interface ExposureData {
  currencies: Array<{
    currency: string;
    current: number;
    cap: number;
    percentage: number;
  }>;
  clusters: Array<{
    cluster: string;
    brains: string[];
    total_exposure: number;
    cap: number;
  }>;
  alerts: Array<{
    type: string;
    message: string;
    severity: string;
  }>;
}

export default function RiskExposurePage() {
  // Try to fetch exposure data from API
  // If endpoint doesn't exist yet, derive from ledger/ops status
  const { data: opsStatus } = useQuery({
    queryKey: ["ops-status-risk"],
    queryFn: () => apiGet<Record<string, unknown>>("/ops/status"),
    refetchInterval: 10_000,
  });

  // Placeholder exposure data — will be populated when API provides dedicated endpoint
  const exposure: ExposureData = {
    currencies: [
      { currency: "EUR/USD", current: 0, cap: 100, percentage: 0 },
      { currency: "GBP/USD", current: 0, cap: 80, percentage: 0 },
      { currency: "USD/JPY", current: 0, cap: 80, percentage: 0 },
      { currency: "AUD/USD", current: 0, cap: 60, percentage: 0 },
      { currency: "USD/CAD", current: 0, cap: 60, percentage: 0 },
    ],
    clusters: [
      { cluster: "USD Majors", brains: ["A2", "B3"], total_exposure: 0, cap: 200 },
      { cluster: "Risk-On", brains: ["C3", "D2"], total_exposure: 0, cap: 150 },
    ],
    alerts: [],
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Risk / Exposure</h1>
        <p className="text-sm text-muted-foreground">
          Visualização de caps por moeda e cluster. Alertas de proximidade de limite.
        </p>
      </div>

      {/* Alerts */}
      {exposure.alerts.length > 0 && (
        <div className="space-y-2">
          {exposure.alerts.map((alert, i) => (
            <AlertBanner
              key={i}
              variant={
                alert.severity === "ERROR"
                  ? "error"
                  : alert.severity === "WARN"
                  ? "warning"
                  : "info"
              }
            >
              {alert.message}
            </AlertBanner>
          ))}
        </div>
      )}

      {/* Currency Exposure Bars */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium uppercase text-muted-foreground mb-4">
          Exposure por Moeda
        </h3>
        <div className="space-y-4">
          {exposure.currencies.map((c) => {
            const pct = c.cap > 0 ? (c.current / c.cap) * 100 : 0;
            const isNearCap = pct >= 80;
            const isOverCap = pct >= 100;

            return (
              <div key={c.currency}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-mono text-foreground">{c.currency}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {c.current.toFixed(0)} / {c.cap.toFixed(0)}
                    </span>
                    {isNearCap && !isOverCap && (
                      <Badge variant="warning">Near Cap</Badge>
                    )}
                    {isOverCap && (
                      <Badge variant="danger">Over Cap</Badge>
                    )}
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isOverCap
                        ? "bg-red-500"
                        : isNearCap
                        ? "bg-yellow-500"
                        : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cluster Table */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium uppercase text-muted-foreground mb-4">
          Exposure por Cluster
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 text-left font-medium">Cluster</th>
                <th className="py-2 text-left font-medium">Brains</th>
                <th className="py-2 text-right font-medium">Exposure</th>
                <th className="py-2 text-right font-medium">Cap</th>
                <th className="py-2 text-right font-medium">%</th>
                <th className="py-2 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {exposure.clusters.map((cluster) => {
                const pct = cluster.cap > 0 ? (cluster.total_exposure / cluster.cap) * 100 : 0;
                return (
                  <tr key={cluster.cluster} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="py-2 font-medium text-foreground">{cluster.cluster}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {cluster.brains.map((b) => (
                          <Badge key={b} variant="muted">{b}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 text-right font-mono text-foreground">
                      {cluster.total_exposure.toFixed(0)}
                    </td>
                    <td className="py-2 text-right font-mono text-muted-foreground">
                      {cluster.cap.toFixed(0)}
                    </td>
                    <td className="py-2 text-right font-mono text-foreground">
                      {pct.toFixed(1)}%
                    </td>
                    <td className="py-2 text-center">
                      <Badge
                        variant={
                          pct >= 100 ? "danger" : pct >= 80 ? "warning" : "success"
                        }
                      >
                        {pct >= 100 ? "OVER" : pct >= 80 ? "NEAR" : "OK"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info note */}
      <div className="rounded border border-border/50 bg-card/50 p-3">
        <p className="text-[10px] text-muted-foreground/60">
          Dados de exposure são derivados do ledger e eventos de execução. Se a API ainda não
          disponibiliza um endpoint dedicado, os valores são placeholders preparados para integração futura.
        </p>
      </div>
    </div>
  );
}
