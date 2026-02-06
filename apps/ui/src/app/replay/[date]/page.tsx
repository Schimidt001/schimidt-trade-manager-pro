"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiDownload } from "@/lib/api";
import { ReplayTimeline } from "@/components/replay/ReplayTimeline";
import { ReplayEventInspector } from "@/components/replay/ReplayEventInspector";
import { TraceDrawer } from "@/components/stream/TraceDrawer";
import { Badge } from "@/components/common/Badge";
import Link from "next/link";

interface ReplayDayData {
  date: string;
  status?: string;
  events: Array<Record<string, unknown>>;
  audit_logs?: Array<Record<string, unknown>>;
}

export default function ReplayDatePage() {
  const params = useParams();
  const date = params.date as string;
  const [selectedEvent, setSelectedEvent] = useState<Record<string, unknown> | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error } = useQuery<ReplayDayData>({
    queryKey: ["replay-day", date],
    queryFn: () => apiGet<ReplayDayData>(`/replay/${date}`),
    enabled: !!date,
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      await apiDownload(`/replay/${date}/export`, `replay-${date}.json`);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/replay"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-foreground">Replay — {date}</h1>
            {data?.status && (
              <Badge variant={data.status === "complete" ? "success" : "warning"}>
                {data.status}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.events?.length || 0} eventos
            {data?.audit_logs ? ` • ${data.audit_logs.length} audit logs` : ""}
          </p>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting || !data}
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
        >
          {exporting ? "Exportando..." : "Export JSON"}
        </button>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Carregando replay do dia {date}...
        </div>
      )}

      {error && (
        <div className="py-12 text-center text-sm text-red-400">
          Erro ao carregar replay: {(error as Error).message}
        </div>
      )}

      {/* Content */}
      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Timeline */}
          <div>
            <h3 className="text-xs font-medium uppercase text-muted-foreground mb-2">
              Timeline
            </h3>
            <ReplayTimeline
              events={(data.events || []).map((e) => ({
                ...e,
                timestamp: (e.timestamp as string) || "",
                severity: e.severity as string,
                event_type: e.event_type as string,
                component: e.component as string,
                correlation_id: e.correlation_id as string,
                event_id: e.event_id as string,
              }))}
              selectedId={
                selectedEvent
                  ? (selectedEvent.event_id as string) || null
                  : null
              }
              onSelect={(e) => setSelectedEvent(e as Record<string, unknown>)}
            />
          </div>

          {/* Inspector */}
          <div>
            <h3 className="text-xs font-medium uppercase text-muted-foreground mb-2">
              Inspector
            </h3>
            <ReplayEventInspector
              event={selectedEvent}
              onTraceClick={(id) => setTraceId(id)}
            />
          </div>
        </div>
      )}

      <TraceDrawer
        correlationId={traceId}
        onClose={() => setTraceId(null)}
      />
    </div>
  );
}
