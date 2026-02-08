"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiDownload } from "@/lib/api";
import { ReplayNarrativeTimeline } from "@/components/replay/ReplayNarrativeTimeline";
import { ReplayDaySummaryCard } from "@/components/replay/ReplayDaySummaryCard";
import { WhyNoTradePanel } from "@/components/replay/WhyNoTradePanel";
import { ReplayEventInspector } from "@/components/replay/ReplayEventInspector";
import { TraceDrawer } from "@/components/stream/TraceDrawer";
import { Badge } from "@/components/common/Badge";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────

interface NarrativeTimelineEntry {
  timestamp: string;
  time: string;
  component: string;
  event_type: string;
  narrative: string;
  severity: string;
  reason_code: string | null;
  reason_description: string | null;
  symbol: string | null;
  brain_id: string | null;
  category: "mcl" | "brain_action" | "brain_skip" | "pm_decision" | "ops_action" | "system" | "audit";
  key_data: Record<string, unknown>;
}

interface BrainSkipExplanation {
  brain_id: string;
  brain_name: string;
  acted: boolean;
  action_type: string | null;
  symbol: string | null;
  skip_reason_code: string | null;
  skip_explanation: string;
  timestamp: string | null;
}

interface WhyNoTradeExplanation {
  had_trade: boolean;
  summary: string;
  brain_explanations: BrainSkipExplanation[];
  pm_final_decision: string | null;
  blocking_reasons: Array<{
    reason_code: string;
    description: string;
    component: string;
    count: number;
  }>;
}

interface DayNarrativeSummary {
  date: string;
  title: string;
  summary: string;
  outcome: "TRADE_EXECUTED" | "NO_TRADE" | "PARTIAL" | "ERROR" | "EMPTY";
  outcome_explanation: string;
  stats: {
    total_events: number;
    mcl_snapshots: number;
    brain_intents: number;
    brain_skips: number;
    pm_decisions: number;
    pm_approvals: number;
    pm_denials: number;
    ops_actions: number;
    audit_logs: number;
    errors: number;
    warnings: number;
  };
  active_brains: string[];
  inactive_brains: string[];
  symbols_involved: string[];
  day_closed_correctly: boolean;
}

interface ReplayDayData {
  date: string;
  status?: string;
  stats?: Record<string, unknown>;
  narrative: DayNarrativeSummary;
  timeline: NarrativeTimelineEntry[];
  why_no_trade: WhyNoTradeExplanation;
  brain_explanations: BrainSkipExplanation[];
  events: Array<Record<string, unknown>>;
  audit_logs?: Array<Record<string, unknown>>;
}

// ─── Component ──────────────────────────────────────────────────

export default function ReplayDatePage() {
  const params = useParams();
  const date = params.date as string;
  const [selectedEvent, setSelectedEvent] = useState<Record<string, unknown> | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"narrative" | "raw">("narrative");

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
            {data?.narrative?.outcome && (
              <Badge
                variant={
                  data.narrative.outcome === "TRADE_EXECUTED" ? "success" :
                  data.narrative.outcome === "NO_TRADE" ? "warning" :
                  data.narrative.outcome === "ERROR" ? "danger" : "muted"
                }
              >
                {data.narrative.outcome}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.events?.length || 0} eventos
            {data?.audit_logs ? ` • ${data.audit_logs.length} audit logs` : ""}
            {data?.narrative?.title ? ` • ${data.narrative.title}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setActiveTab("narrative")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "narrative"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-secondary"
              }`}
            >
              Narrativa
            </button>
            <button
              onClick={() => setActiveTab("raw")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "raw"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-secondary"
              }`}
            >
              Raw Events
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting || !data}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
          >
            {exporting ? "Exportando..." : "Export JSON"}
          </button>
        </div>
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

      {/* Content — Narrative Tab */}
      {data && activeTab === "narrative" && (
        <div className="space-y-6">
          {/* Day Summary */}
          {data.narrative && (
            <ReplayDaySummaryCard summary={data.narrative} />
          )}

          {/* Two columns: Timeline + Why No Trade */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Timeline (2/3 width) */}
            <div className="lg:col-span-2">
              {data.timeline && data.timeline.length > 0 ? (
                <ReplayNarrativeTimeline
                  timeline={data.timeline}
                  date={date}
                />
              ) : (
                <div className="rounded-lg border border-border bg-card p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nenhum evento na timeline para este dia.
                  </p>
                </div>
              )}
            </div>

            {/* Why No Trade (1/3 width) */}
            <div>
              {data.why_no_trade && (
                <WhyNoTradePanel data={data.why_no_trade} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content — Raw Events Tab */}
      {data && activeTab === "raw" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Events list */}
          <div>
            <h3 className="text-xs font-medium uppercase text-muted-foreground mb-2">
              Eventos ({data.events?.length || 0})
            </h3>
            <div className="max-h-[600px] overflow-y-auto rounded-lg border border-border bg-card">
              {(data.events || []).map((event, idx) => {
                const isSelected = selectedEvent?.event_id === event.event_id;
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedEvent(event)}
                    className={`px-3 py-2 border-b border-border cursor-pointer transition-colors hover:bg-secondary/50 ${
                      isSelected ? "bg-primary/10 border-l-2 border-l-primary" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {event.timestamp
                          ? new Date(event.timestamp as string).toLocaleTimeString("pt-BR", {
                              timeZone: "America/Sao_Paulo",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: false,
                            })
                          : "—"}
                      </span>
                      <Badge
                        variant={
                          event.severity === "ERROR" ? "danger" :
                          event.severity === "WARN" ? "warning" : "info"
                        }
                        size="sm"
                      >
                        {(event.severity as string) || "INFO"}
                      </Badge>
                      <span className="text-[10px] font-medium text-foreground">
                        {(event.event_type as string) || "—"}
                      </span>
                      {event.component ? (
                        <span className="text-[10px] text-muted-foreground">
                          {String(event.component)}
                        </span>
                      ) : null}
                    </div>
                    {event.symbol ? (
                      <span className="text-[10px] text-muted-foreground/70 ml-16">
                        {String(event.symbol)}
                      </span>
                    ) : null}
                  </div>
                );
              })}
              {(!data.events || data.events.length === 0) && (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Nenhum evento
                </div>
              )}
            </div>
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
