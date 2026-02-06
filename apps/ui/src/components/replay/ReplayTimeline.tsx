"use client";

import { Badge } from "@/components/common/Badge";
import { formatTime, severityBgColor } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ReplayEvent {
  event_id?: string;
  event_type?: string;
  timestamp: string;
  severity?: string;
  component?: string;
  correlation_id?: string;
  [key: string]: unknown;
}

interface ReplayTimelineProps {
  events: ReplayEvent[];
  selectedId?: string | null;
  onSelect: (event: ReplayEvent) => void;
}

export function ReplayTimeline({ events, selectedId, onSelect }: ReplayTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Sem eventos para este dia.
      </div>
    );
  }

  return (
    <div className="space-y-0.5 max-h-[600px] overflow-y-auto">
      {events.map((event, i) => {
        const isSelected = selectedId === (event.event_id || `${i}`);
        return (
          <button
            key={event.event_id || i}
            onClick={() => onSelect(event)}
            className={cn(
              "w-full flex items-center gap-3 rounded px-3 py-2 text-left transition-colors",
              isSelected
                ? "bg-primary/10 border border-primary/30"
                : "hover:bg-secondary/30 border border-transparent"
            )}
          >
            {/* Timeline dot */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  event.severity === "ERROR"
                    ? "bg-red-400"
                    : event.severity === "WARN"
                    ? "bg-yellow-400"
                    : "bg-blue-400"
                )}
              />
              {i < events.length - 1 && (
                <div className="w-px h-4 bg-border mt-1" />
              )}
            </div>

            {/* Time */}
            <span className="font-mono text-[10px] text-muted-foreground w-16 flex-shrink-0">
              {formatTime(event.timestamp)}
            </span>

            {/* Event type */}
            <span className="text-xs font-medium text-foreground flex-1 truncate">
              {event.event_type || "—"}
            </span>

            {/* Severity badge */}
            {event.severity && (
              <Badge className={severityBgColor(event.severity)}>
                {event.severity}
              </Badge>
            )}

            {/* Component */}
            {event.component && (
              <span className="text-[10px] text-muted-foreground">
                {event.component}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
