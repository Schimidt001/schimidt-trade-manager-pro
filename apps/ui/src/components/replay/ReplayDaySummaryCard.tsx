"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/common/Badge";

// ─── Types ──────────────────────────────────────────────────────

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

interface ReplayDaySummaryCardProps {
  summary: DayNarrativeSummary;
}

// ─── Outcome Config ─────────────────────────────────────────────

const OUTCOME_CONFIG: Record<string, {
  label: string;
  variant: "success" | "warning" | "danger" | "info" | "muted";
  icon: React.ReactNode;
}> = {
  TRADE_EXECUTED: {
    label: "Trade Executado",
    variant: "success",
    icon: (
      <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  NO_TRADE: {
    label: "Sem Operação",
    variant: "warning",
    icon: (
      <svg className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
  },
  PARTIAL: {
    label: "Parcial",
    variant: "info",
    icon: (
      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  ERROR: {
    label: "Erro",
    variant: "danger",
    icon: (
      <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  EMPTY: {
    label: "Vazio",
    variant: "muted",
    icon: (
      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
      </svg>
    ),
  },
};

// ─── Component ──────────────────────────────────────────────────

export function ReplayDaySummaryCard({ summary }: ReplayDaySummaryCardProps) {
  const outcomeConfig = OUTCOME_CONFIG[summary.outcome] || OUTCOME_CONFIG.EMPTY;

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header with outcome */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start gap-3">
          {outcomeConfig.icon}
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">{summary.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {summary.outcome_explanation}
            </p>
          </div>
          <Badge variant={outcomeConfig.variant} size="md">
            {outcomeConfig.label}
          </Badge>
        </div>
      </div>

      {/* Summary text */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs text-foreground leading-relaxed">{summary.summary}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <StatCell label="Total Eventos" value={summary.stats.total_events} />
        <StatCell label="MCL Snapshots" value={summary.stats.mcl_snapshots} />
        <StatCell label="Brain Intents" value={summary.stats.brain_intents} highlight={summary.stats.brain_intents > 0 ? "success" : undefined} />
        <StatCell label="Brain Skips" value={summary.stats.brain_skips} highlight={summary.stats.brain_skips > 0 ? "warning" : undefined} />
        <StatCell label="PM Aprovações" value={summary.stats.pm_approvals} highlight={summary.stats.pm_approvals > 0 ? "success" : undefined} />
        <StatCell label="PM Negações" value={summary.stats.pm_denials} highlight={summary.stats.pm_denials > 0 ? "danger" : undefined} />
        <StatCell label="Erros" value={summary.stats.errors} highlight={summary.stats.errors > 0 ? "danger" : undefined} />
        <StatCell label="Audit Logs" value={summary.stats.audit_logs} />
      </div>

      {/* Brains + Symbols */}
      <div className="px-4 py-3 space-y-2">
        {/* Active brains */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase text-muted-foreground font-medium w-20">Ativos:</span>
          {summary.active_brains.length > 0 ? (
            summary.active_brains.map((b) => (
              <Badge key={b} variant="success" size="sm">{b}</Badge>
            ))
          ) : (
            <span className="text-[10px] text-muted-foreground/60">Nenhum</span>
          )}
        </div>

        {/* Inactive brains */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase text-muted-foreground font-medium w-20">Inativos:</span>
          {summary.inactive_brains.length > 0 ? (
            summary.inactive_brains.map((b) => (
              <Badge key={b} variant="warning" size="sm">{b}</Badge>
            ))
          ) : (
            <span className="text-[10px] text-muted-foreground/60">Nenhum</span>
          )}
        </div>

        {/* Symbols */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase text-muted-foreground font-medium w-20">Símbolos:</span>
          {summary.symbols_involved.length > 0 ? (
            summary.symbols_involved.map((s) => (
              <Badge key={s} variant="info" size="sm">{s}</Badge>
            ))
          ) : (
            <span className="text-[10px] text-muted-foreground/60">Nenhum</span>
          )}
        </div>

        {/* Day closed correctly */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
          <span className="text-[10px] uppercase text-muted-foreground font-medium">Dia encerrado:</span>
          {summary.day_closed_correctly ? (
            <Badge variant="success" size="sm">
              <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Corretamente
            </Badge>
          ) : (
            <Badge variant="warning" size="sm">
              <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
              </svg>
              Incompleto
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stat Cell ──────────────────────────────────────────────────

function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "success" | "warning" | "danger";
}) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          "text-lg font-bold font-mono mt-0.5",
          highlight === "success" && "text-emerald-400",
          highlight === "warning" && "text-yellow-400",
          highlight === "danger" && "text-red-400",
          !highlight && "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
