"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Badge, StatusDot } from "@/components/common/Badge";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  time: string;
  currency: string;
  impact: string;
  title: string;
  previous?: string;
  forecast?: string;
  actual?: string;
}

interface CalendarWindow {
  start: string;
  end: string;
  type: string;
  label: string;
}

interface OpsStatus {
  provider_states: Record<string, string>;
  [key: string]: unknown;
}

function impactVariant(impact: string): "danger" | "warning" | "info" | "muted" {
  switch (impact?.toUpperCase()) {
    case "HIGH":
      return "danger";
    case "MEDIUM":
      return "warning";
    case "LOW":
      return "info";
    default:
      return "muted";
  }
}

export default function CalendarPage() {
  // Try to load calendar events from ops/status or a calendar endpoint
  const { data: opsStatus } = useQuery<OpsStatus>({
    queryKey: ["ops-status-calendar"],
    queryFn: () => apiGet<OpsStatus>("/ops/status"),
    refetchInterval: 30_000,
  });

  // Placeholder events — the API may not have a dedicated calendar endpoint yet.
  // When available, replace with: apiGet("/calendar/events")
  const calendarEvents: CalendarEvent[] = [];
  const tradingWindows: CalendarWindow[] = [
    {
      start: "T-30",
      end: "T+20",
      type: "NO_TRADE",
      label: "No Trade Zone (T-30 → T+20)",
    },
    {
      start: "T+20",
      end: "T+60",
      type: "CONDITIONAL",
      label: "Conditional Zone (T+20 → T+60)",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Eventos económicos do dia, janelas de trading e status dos provedores.
        </p>
      </div>

      {/* Provider Status */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">
          Provider Status
        </h3>
        <div className="flex flex-wrap gap-4">
          {opsStatus?.provider_states &&
          Object.keys(opsStatus.provider_states).length > 0 ? (
            Object.entries(opsStatus.provider_states).map(([name, state]) => (
              <div key={name} className="flex items-center gap-2">
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
                />
                <span className="text-xs text-foreground">{name}</span>
                <Badge variant="muted">{state}</Badge>
              </div>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">
              Sem dados de provedores disponíveis
            </span>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Fallback:</span>
            <Badge variant="muted">Disponível</Badge>
          </div>
        </div>
      </div>

      {/* Trading Windows */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">
          Trading Windows
        </h3>
        <div className="space-y-2">
          {tradingWindows.map((w, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center justify-between rounded border px-4 py-3",
                w.type === "NO_TRADE"
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-yellow-500/30 bg-yellow-500/5"
              )}
            >
              <div className="flex items-center gap-3">
                <Badge variant={w.type === "NO_TRADE" ? "danger" : "warning"}>
                  {w.type}
                </Badge>
                <span className="text-sm text-foreground">{w.label}</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {w.start} → {w.end}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Events */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">
          Eventos do Dia
        </h3>

        {calendarEvents.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Sem eventos carregados. Endpoint de calendário ainda não disponível.
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Quando disponível, os eventos serão carregados automaticamente com hora, impacto, moeda e valores.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Hora</th>
                  <th className="py-2 text-left font-medium">Moeda</th>
                  <th className="py-2 text-left font-medium">Impacto</th>
                  <th className="py-2 text-left font-medium">Evento</th>
                  <th className="py-2 text-right font-medium">Previous</th>
                  <th className="py-2 text-right font-medium">Forecast</th>
                  <th className="py-2 text-right font-medium">Actual</th>
                </tr>
              </thead>
              <tbody>
                {calendarEvents.map((event, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="py-2 font-mono text-xs">{formatTime(event.time)}</td>
                    <td className="py-2">
                      <Badge>{event.currency}</Badge>
                    </td>
                    <td className="py-2">
                      <Badge variant={impactVariant(event.impact)}>{event.impact}</Badge>
                    </td>
                    <td className="py-2 text-foreground">{event.title}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">
                      {event.previous || "—"}
                    </td>
                    <td className="py-2 text-right font-mono text-muted-foreground">
                      {event.forecast || "—"}
                    </td>
                    <td className="py-2 text-right font-mono text-foreground">
                      {event.actual || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
