"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { StreamTabs, type LogStream } from "@/components/logs/StreamTabs";
import { LogsViewer } from "@/components/logs/LogsViewer";
import { TraceDrawer } from "@/components/stream/TraceDrawer";

export default function LogsPage() {
  const [stream, setStream] = useState<LogStream>("decision");
  const [traceId, setTraceId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["logs-tail"],
    queryFn: () =>
      apiGet<{ events: Array<Record<string, unknown>> }>("/decisions/tail", {
        limit: "200",
      }),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Logs</h1>
        <p className="text-sm text-muted-foreground">
          Logs organizados por stream. Clique no correlation ID para rastrear.
        </p>
      </div>

      <StreamTabs active={stream} onChange={setStream} />

      <LogsViewer
        events={(data?.events || []) as Array<{
          event_id?: string;
          event_type?: string;
          timestamp: string;
          severity: string;
          component?: string;
          reason_code?: string;
          reason?: string;
          correlation_id?: string;
          [key: string]: unknown;
        }>}
        stream={stream}
        loading={isLoading}
        onCorrelationClick={(id) => setTraceId(id)}
      />

      <TraceDrawer
        correlationId={traceId}
        onClose={() => setTraceId(null)}
      />
    </div>
  );
}
