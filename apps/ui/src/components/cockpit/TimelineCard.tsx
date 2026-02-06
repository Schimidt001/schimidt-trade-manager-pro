"use client";

import { Badge } from "@/components/common/Badge";
import { formatTime } from "@/lib/format";

interface TimelineEvent {
  time: string;
  label: string;
  type: string;
  status?: string;
}

interface TimelineCardProps {
  events: TimelineEvent[];
  nextEvent?: string;
}

export function TimelineCard({ events, nextEvent }: TimelineCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">
          Timeline / Checkpoints
        </h3>
        {nextEvent && (
          <Badge variant="info" size="sm">
            Next: {nextEvent}
          </Badge>
        )}
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem eventos recentes</p>
      ) : (
        <div className="space-y-1">
          {events.slice(0, 8).map((event, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded px-2 py-1.5 text-xs hover:bg-secondary/30 transition-colors"
            >
              <span className="font-mono text-muted-foreground w-16 flex-shrink-0">
                {formatTime(event.time)}
              </span>
              <div className="h-1.5 w-1.5 rounded-full bg-primary/60 flex-shrink-0" />
              <span className="text-foreground flex-1 truncate">{event.label}</span>
              {event.status && (
                <Badge
                  variant={
                    event.status === "OK" || event.status === "DONE"
                      ? "success"
                      : event.status === "PENDING"
                      ? "warning"
                      : "muted"
                  }
                >
                  {event.status}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
