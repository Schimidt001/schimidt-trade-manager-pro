"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Badge } from "@/components/common/Badge";
import { JsonCollapse } from "@/components/common/JsonCollapse";
import { CopyButton } from "@/components/common/CopyButton";
import { formatTime, severityBgColor } from "@/lib/format";

interface TraceDrawerProps {
  correlationId: string | null;
  onClose: () => void;
}

interface TraceEvent {
  event_id: string;
  event_type: string;
  timestamp: string;
  severity: string;
  component: string;
  reason_code?: string;
  reason?: string;
  payload?: Record<string, unknown>;
}

function TraceEventCard({ event }: { event: TraceEvent }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      {/* Event header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {formatTime(event.timestamp)}
          </span>
          <Badge className={severityBgColor(event.severity)}>
            {event.severity}
          </Badge>
          <span className="text-xs font-medium text-foreground">
            {event.event_type}
          </span>
        </div>
      </div>

      {/* Component */}
      <div className="text-[10px] text-muted-foreground mb-1">
        {"Component: "}
        <span className="font-mono">{event.component}</span>
      </div>

      {/* Reason */}
      {event.reason_code ? (
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="muted">{event.reason_code}</Badge>
          {event.reason ? (
            <span className="text-xs text-muted-foreground">
              {event.reason}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Payload */}
      {event.payload ? (
        <JsonCollapse data={event.payload} label="Payload" />
      ) : null}
    </div>
  );
}

export function TraceDrawer({ correlationId, onClose }: TraceDrawerProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["trace", correlationId],
    queryFn: () =>
      apiGet<{ correlation_id: string; events: TraceEvent[] }>(
        `/decisions/trace/${correlationId}`
      ),
    enabled: !!correlationId,
  });

  if (!correlationId) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Overlay */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-lg border-l border-border bg-card shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Trace</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-[10px] text-muted-foreground">
                {correlationId}
              </span>
              <CopyButton text={correlationId} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando trace...</p>
          ) : null}

          {error ? (
            <p className="text-sm text-red-400">
              {"Erro ao carregar trace: "}{(error as Error).message}
            </p>
          ) : null}

          {data ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {String(data.events?.length || 0)} eventos nesta correlação
              </p>

              {(data.events || []).map((event: TraceEvent, i: number) => (
                <TraceEventCard key={event.event_id || i} event={event} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
