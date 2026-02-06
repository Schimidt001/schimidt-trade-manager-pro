"use client";

import { useEffect, useState, useRef } from "react";
import { Badge } from "@/components/common/Badge";
import { JsonCollapse } from "@/components/common/JsonCollapse";
import { CopyButton } from "@/components/common/CopyButton";
import { formatTime, severityBgColor } from "@/lib/format";
import { onSSEEvent } from "@/lib/sse";

interface StreamEvent {
  id: string;
  event_type: string;
  timestamp: string;
  severity: string;
  component?: string;
  brain_id?: string;
  symbol?: string;
  reason_code?: string;
  reason?: string;
  correlation_id?: string;
  payload: unknown;
}

interface EventStreamProps {
  filters: {
    symbol: string;
    brain_id: string;
    severity: string;
    reason_code: string;
  };
  onTraceClick: (correlationId: string) => void;
  restEvents?: Array<Record<string, unknown>>;
}

export function EventStream({ filters, onTraceClick, restEvents }: EventStreamProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  // Inicializar com eventos REST
  useEffect(() => {
    if (restEvents && restEvents.length > 0) {
      const mapped = restEvents.map((e, i) => ({
        id: (e.event_id as string) || `rest-${i}`,
        event_type: (e.event_type as string) || "UNKNOWN",
        timestamp: (e.timestamp as string) || new Date().toISOString(),
        severity: (e.severity as string) || "INFO",
        component: e.component as string,
        brain_id: e.brain_id as string,
        symbol: e.symbol as string,
        reason_code: e.reason_code as string,
        reason: e.reason as string,
        correlation_id: e.correlation_id as string,
        payload: e,
      }));
      setEvents(mapped);
    }
  }, [restEvents]);

  // SSE events
  useEffect(() => {
    const unsub = onSSEEvent((sseEvent) => {
      if (sseEvent.type === "connected" || sseEvent.type === "ping") return;

      const data = sseEvent.data as Record<string, unknown>;
      const newEvent: StreamEvent = {
        id: (data.event_id as string) || `sse-${Date.now()}`,
        event_type: (data.event_type as string) || sseEvent.type,
        timestamp: sseEvent.timestamp,
        severity: (data.severity as string) || "INFO",
        component: data.component as string,
        brain_id: data.brain_id as string,
        symbol: data.symbol as string,
        reason_code: data.reason_code as string,
        reason: data.reason as string,
        correlation_id: data.correlation_id as string,
        payload: data,
      };

      setEvents((prev) => [newEvent, ...prev].slice(0, 500));
    });

    return unsub;
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events, autoScroll]);

  // Apply filters
  const filtered = events.filter((e) => {
    if (filters.symbol && !e.symbol?.toLowerCase().includes(filters.symbol.toLowerCase()))
      return false;
    if (filters.brain_id && e.brain_id !== filters.brain_id) return false;
    if (filters.severity && e.severity !== filters.severity) return false;
    if (
      filters.reason_code &&
      !e.reason_code?.toLowerCase().includes(filters.reason_code.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="flex flex-col">
      {/* Controls */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          {filtered.length} eventos {filters.symbol || filters.brain_id || filters.severity || filters.reason_code ? "(filtrado)" : ""}
        </span>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>
      </div>

      {/* Event list */}
      <div ref={listRef} className="space-y-1 max-h-[600px] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sem eventos. Aguardando stream...
          </p>
        ) : (
          filtered.map((event) => (
            <div
              key={event.id}
              className="rounded border border-border bg-card p-3 hover:bg-secondary/30 transition-colors"
            >
              {/* Event header line */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">
                  [{formatTime(event.timestamp)}]
                </span>
                <Badge className={severityBgColor(event.severity)}>
                  {event.severity}
                </Badge>
                <span className="text-xs font-medium text-foreground">
                  {event.event_type}
                </span>
                {event.reason_code && (
                  <span className="text-[10px] text-muted-foreground">
                    — {event.reason_code}
                  </span>
                )}
                {event.brain_id && (
                  <Badge variant="muted">{event.brain_id}</Badge>
                )}
                {event.symbol && (
                  <Badge variant="info">{event.symbol}</Badge>
                )}
              </div>

              {/* Reason text */}
              {event.reason && (
                <p className="mt-1 text-xs text-muted-foreground">{event.reason}</p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-2">
                {event.correlation_id && (
                  <button
                    onClick={() => onTraceClick(event.correlation_id!)}
                    className="text-[10px] font-mono text-primary hover:underline"
                  >
                    trace:{event.correlation_id.slice(0, 8)}
                  </button>
                )}
                {event.correlation_id && (
                  <CopyButton text={event.correlation_id} label="ID" />
                )}
              </div>

              {/* Payload */}
              <div className="mt-2">
                <JsonCollapse data={event.payload} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
