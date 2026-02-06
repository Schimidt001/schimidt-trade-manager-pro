"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { EventStream } from "@/components/stream/EventStream";
import { FiltersBar } from "@/components/stream/FiltersBar";
import { TraceDrawer } from "@/components/stream/TraceDrawer";

export default function DecisionsLivePage() {
  const [filters, setFilters] = useState({
    symbol: "",
    brain_id: "",
    severity: "",
    reason_code: "",
  });
  const [traceId, setTraceId] = useState<string | null>(null);

  // Fetch initial events via REST (tail)
  const { data: tailData } = useQuery({
    queryKey: ["decisions-tail-live"],
    queryFn: () =>
      apiGet<{ events: Array<Record<string, unknown>> }>("/decisions/tail", {
        limit: "100",
      }),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Decisions — Live Stream</h1>
        <p className="text-sm text-muted-foreground">
          Stream de decisões em tempo real via SSE. Clique no correlation ID para abrir o trace.
        </p>
      </div>

      <FiltersBar filters={filters} onChange={setFilters} />

      <EventStream
        filters={filters}
        onTraceClick={(id) => setTraceId(id)}
        restEvents={tailData?.events}
      />

      <TraceDrawer
        correlationId={traceId}
        onClose={() => setTraceId(null)}
      />
    </div>
  );
}
