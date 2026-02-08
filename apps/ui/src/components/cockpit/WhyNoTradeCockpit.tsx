"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/common/Badge";

// ─── Types ──────────────────────────────────────────────────────

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
  outcome: string;
  outcome_explanation: string;
  stats: Record<string, number>;
  active_brains: string[];
  inactive_brains: string[];
  symbols_involved: string[];
  day_closed_correctly: boolean;
}

interface NarrativeResponse {
  date: string;
  summary: DayNarrativeSummary;
  why_no_trade: WhyNoTradeExplanation;
  brain_explanations: BrainSkipExplanation[];
}

// ─── Component ──────────────────────────────────────────────────

export function WhyNoTradeCockpit() {
  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading, error } = useQuery<NarrativeResponse>({
    queryKey: ["replay-narrative-today", today],
    queryFn: () => apiGet<NarrativeResponse>(`/replay/${today}/narrative`),
    refetchInterval: 30_000, // Refresh every 30s
    retry: 1,
  });

  // If no data yet (no tick run today), show placeholder
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium uppercase text-muted-foreground mb-2">
          Por que não operamos?
        </h3>
        <div className="py-4 text-center text-xs text-muted-foreground animate-pulse">
          Carregando narrativa do dia...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium uppercase text-muted-foreground mb-2">
          Por que não operamos?
        </h3>
        <div className="rounded border border-yellow-500/20 bg-yellow-500/5 px-3 py-3">
          <p className="text-xs text-yellow-400">
            Nenhum dado de replay disponível para hoje ({today}).
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Execute um tick via <code className="font-mono">Run Tick</code> para gerar eventos e ver a narrativa do dia.
          </p>
        </div>
      </div>
    );
  }

  const whyNoTrade = data.why_no_trade;
  const brainExplanations = data.brain_explanations;

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase text-muted-foreground">
            {whyNoTrade.had_trade ? "Resultado do Dia" : "Por que não operamos?"}
          </h3>
          <Badge
            variant={whyNoTrade.had_trade ? "success" : "warning"}
            size="sm"
          >
            {whyNoTrade.had_trade ? "TRADE" : "NO_TRADE"}
          </Badge>
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs text-foreground leading-relaxed">
          {whyNoTrade.summary}
        </p>
      </div>

      {/* Brain status grid */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-2 gap-2">
          {brainExplanations.map((brain) => (
            <div
              key={brain.brain_id}
              className={cn(
                "rounded-md border p-2",
                brain.acted
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : brain.skip_reason_code
                  ? "border-yellow-500/20 bg-yellow-500/5"
                  : "border-border bg-secondary/30"
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {brain.acted ? (
                  <svg className="h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-3 w-3 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                )}
                <span className="text-[10px] font-semibold text-foreground">
                  {brain.brain_id}
                </span>
                <Badge
                  variant={brain.acted ? "success" : brain.skip_reason_code ? "warning" : "muted"}
                  size="sm"
                >
                  {brain.acted ? "ATUOU" : "SKIP"}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                {brain.acted
                  ? `${brain.action_type || "INTENT"}${brain.symbol ? ` — ${brain.symbol}` : ""}`
                  : brain.skip_explanation
                }
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* PM Decision */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground font-medium">PM:</span>
          <Badge
            variant={
              whyNoTrade.pm_final_decision?.includes("ALLOWED") || whyNoTrade.pm_final_decision?.includes("APPROVED")
                ? "success"
                : whyNoTrade.pm_final_decision?.includes("DENIED") || whyNoTrade.pm_final_decision?.includes("REJECTED")
                ? "danger"
                : "warning"
            }
            size="sm"
          >
            {whyNoTrade.pm_final_decision || "NO_TRADE"}
          </Badge>
        </div>
      </div>

      {/* Blocking reasons (compact) */}
      {whyNoTrade.blocking_reasons.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase text-muted-foreground font-medium mb-1.5">
            Motivos de bloqueio:
          </p>
          <div className="space-y-1">
            {whyNoTrade.blocking_reasons.slice(0, 3).map((reason, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
                <span className="text-[10px] text-muted-foreground truncate">
                  {reason.description}
                </span>
                <Badge variant="danger" size="sm">{reason.count}x</Badge>
              </div>
            ))}
            {whyNoTrade.blocking_reasons.length > 3 && (
              <p className="text-[10px] text-muted-foreground/60">
                +{whyNoTrade.blocking_reasons.length - 3} motivo(s) adicional(is)
              </p>
            )}
          </div>
        </div>
      )}

      {/* No blocking reasons */}
      {whyNoTrade.blocking_reasons.length === 0 && !whyNoTrade.had_trade && (
        <div className="px-4 py-3">
          <p className="text-[10px] text-muted-foreground/70 italic">
            Sem bloqueios explícitos — cérebros não encontraram edge.
          </p>
        </div>
      )}
    </div>
  );
}
