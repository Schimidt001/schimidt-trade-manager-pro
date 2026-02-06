"use client";

import Link from "next/link";
import { Badge } from "@/components/common/Badge";

interface ReplayDay {
  date: string;
  status: string;
  event_count?: number;
  audit_count?: number;
}

interface ReplayDayListProps {
  days: ReplayDay[];
  loading?: boolean;
}

export function ReplayDayList({ days, loading }: ReplayDayListProps) {
  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Carregando dias de replay...
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Nenhum dia de replay disponível.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {days.map((day) => (
        <div
          key={day.date}
          className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:bg-secondary/20 transition-colors"
        >
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm font-medium text-foreground">
              {day.date}
            </span>
            <Badge
              variant={
                day.status === "complete"
                  ? "success"
                  : day.status === "partial"
                  ? "warning"
                  : "muted"
              }
            >
              {day.status}
            </Badge>
            {day.event_count !== undefined && (
              <span className="text-xs text-muted-foreground">
                {day.event_count} eventos
              </span>
            )}
            {day.audit_count !== undefined && (
              <span className="text-xs text-muted-foreground">
                {day.audit_count} audit
              </span>
            )}
          </div>

          <Link
            href={`/replay/${day.date}`}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            Open
          </Link>
        </div>
      ))}
    </div>
  );
}
