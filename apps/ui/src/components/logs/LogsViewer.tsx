"use client";

import { Badge } from "@/components/common/Badge";
import { JsonCollapse } from "@/components/common/JsonCollapse";
import { CopyButton } from "@/components/common/CopyButton";
import { formatTime, severityBgColor } from "@/lib/format";
import type { LogStream } from "./StreamTabs";

interface LogEntry {
  event_id?: string;
  event_type?: string;
  timestamp: string;
  severity: string;
  component?: string;
  reason_code?: string;
  reason?: string;
  correlation_id?: string;
  [key: string]: unknown;
}

interface LogsViewerProps {
  events: LogEntry[];
  stream: LogStream;
  loading?: boolean;
  onCorrelationClick?: (id: string) => void;
}

/**
 * Filtra eventos por stream (tipo).
 */
function filterByStream(events: LogEntry[], stream: LogStream): LogEntry[] {
  return events.filter((e) => {
    const eventType = (e.event_type || "").toUpperCase();
    const component = (e.component || "").toUpperCase();

    switch (stream) {
      case "decision":
        return (
          eventType.includes("INTENT") ||
          eventType.includes("PM_DECISION") ||
          eventType.includes("MCL") ||
          component.includes("BRAIN") ||
          component.includes("PM") ||
          component.includes("MCL")
        );
      case "execution":
        return (
          eventType.includes("EHM") ||
          eventType.includes("EXECUTION") ||
          eventType.includes("EXECUTOR") ||
          component.includes("EHM") ||
          component.includes("EXECUTOR")
        );
      case "system":
        return (
          eventType.includes("SYSTEM") ||
          eventType.includes("CONFIG") ||
          eventType.includes("OPS") ||
          component.includes("SYSTEM") ||
          component.includes("OPS")
        );
      case "security":
        return (
          eventType.includes("AUTH") ||
          eventType.includes("AUDIT") ||
          eventType.includes("SECURITY") ||
          component.includes("AUTH") ||
          component.includes("SECURITY") ||
          (e.severity || "").toUpperCase() === "ERROR"
        );
      default:
        return true;
    }
  });
}

export function LogsViewer({ events, stream, loading, onCorrelationClick }: LogsViewerProps) {
  const filtered = filterByStream(events, stream);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Carregando logs...
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Sem logs para o stream &quot;{stream}&quot;
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {filtered.map((entry, i) => (
        <div
          key={entry.event_id || i}
          className="rounded border border-border bg-card p-3 hover:bg-secondary/20 transition-colors"
        >
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">
              [{formatTime(entry.timestamp)}]
            </span>
            <Badge className={severityBgColor(entry.severity)}>
              {entry.severity}
            </Badge>
            <span className="text-xs font-medium text-foreground">
              {entry.event_type || "—"}
            </span>
            {entry.component && (
              <span className="text-[10px] text-muted-foreground">
                [{entry.component}]
              </span>
            )}
          </div>

          {/* Reason */}
          {entry.reason_code && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="muted">{entry.reason_code}</Badge>
              {entry.reason && (
                <span className="text-xs text-muted-foreground">{entry.reason}</span>
              )}
            </div>
          )}

          {/* Correlation */}
          {entry.correlation_id && (
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => onCorrelationClick?.(entry.correlation_id!)}
                className="text-[10px] font-mono text-primary hover:underline"
              >
                correlation:{entry.correlation_id.slice(0, 8)}
              </button>
              <CopyButton text={entry.correlation_id} />
            </div>
          )}

          {/* Payload */}
          <div className="mt-2">
            <JsonCollapse data={entry} label="Full Entry" />
          </div>
        </div>
      ))}
    </div>
  );
}
