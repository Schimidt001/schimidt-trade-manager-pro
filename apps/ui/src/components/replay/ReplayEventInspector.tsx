"use client";

import { Badge } from "@/components/common/Badge";
import { JsonCollapse } from "@/components/common/JsonCollapse";
import { CopyButton } from "@/components/common/CopyButton";
import { formatDateTime, severityBgColor } from "@/lib/format";

interface ReplayEventInspectorProps {
  event: Record<string, unknown> | null;
  onTraceClick?: (correlationId: string) => void;
}

export function ReplayEventInspector({ event, onTraceClick }: ReplayEventInspectorProps) {
  if (!event) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Selecione um evento na timeline para inspecionar.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Event Inspector</h3>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground">Event Type</span>
          <div className="mt-0.5 font-mono text-foreground">
            {(event.event_type as string) || "—"}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Timestamp</span>
          <div className="mt-0.5 font-mono text-foreground">
            {event.timestamp ? formatDateTime(event.timestamp as string) : "—"}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Severity</span>
          <div className="mt-0.5">
            {event.severity ? (
              <Badge className={severityBgColor(event.severity as string)}>
                {event.severity as string}
              </Badge>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Component</span>
          <div className="mt-0.5 font-mono text-foreground">
            {(event.component as string) || "—"}
          </div>
        </div>
        {event.brain_id ? (
          <div>
            <span className="text-muted-foreground">Brain</span>
            <div className="mt-0.5">
              <Badge variant="info">{String(event.brain_id)}</Badge>
            </div>
          </div>
        ) : null}
        {event.symbol ? (
          <div>
            <span className="text-muted-foreground">Symbol</span>
            <div className="mt-0.5 font-mono text-foreground">
              {String(event.symbol)}
            </div>
          </div>
        ) : null}
      </div>

      {/* Reason */}
      {event.reason_code ? (
        <div>
          <span className="text-xs text-muted-foreground">Reason</span>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="muted">{String(event.reason_code)}</Badge>
            {event.reason ? (
              <span className="text-xs text-muted-foreground">
                {String(event.reason)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Correlation */}
      {event.correlation_id ? (
        <div>
          <span className="text-xs text-muted-foreground">Correlation ID</span>
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={() => onTraceClick?.(String(event.correlation_id))}
              className="font-mono text-xs text-primary hover:underline"
            >
              {String(event.correlation_id)}
            </button>
            <CopyButton text={String(event.correlation_id)} />
          </div>
        </div>
      ) : null}

      {/* Full payload */}
      <JsonCollapse data={event} label="Full Payload" defaultOpen />
    </div>
  );
}
