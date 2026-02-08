"use client";

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

interface WhyNoTradePanelProps {
  data: WhyNoTradeExplanation;
}

// ─── Brain Status Config ────────────────────────────────────────

function brainStatusConfig(brain: BrainSkipExplanation): {
  variant: "success" | "warning" | "danger" | "muted";
  icon: React.ReactNode;
  statusLabel: string;
} {
  if (brain.acted) {
    return {
      variant: "success",
      statusLabel: `ATUOU — ${brain.action_type || "INTENT"}`,
      icon: (
        <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    };
  }

  if (brain.skip_reason_code) {
    return {
      variant: "warning",
      statusLabel: "SKIP",
      icon: (
        <svg className="h-4 w-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
    };
  }

  return {
    variant: "muted",
    statusLabel: "NÃO EXECUTADO",
    icon: (
      <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
      </svg>
    ),
  };
}

// ─── Component ──────────────────────────────────────────────────

export function WhyNoTradePanel({ data }: WhyNoTradePanelProps) {
  const headerBg = data.had_trade
    ? "bg-emerald-500/5 border-emerald-500/20"
    : "bg-yellow-500/5 border-yellow-500/20";

  const headerIcon = data.had_trade ? (
    <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ) : (
    <svg className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className={cn("border-b px-4 py-3 rounded-t-lg", headerBg)}>
        <div className="flex items-start gap-3">
          {headerIcon}
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              {data.had_trade ? "Resultado: Operação Executada" : "Por que não operamos?"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {data.summary}
            </p>
          </div>
        </div>
      </div>

      {/* PM Final Decision */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground font-medium">
            Decisão Final PM:
          </span>
          <Badge
            variant={
              data.pm_final_decision?.includes("ALLOWED") || data.pm_final_decision?.includes("APPROVED")
                ? "success"
                : data.pm_final_decision?.includes("DENIED") || data.pm_final_decision?.includes("REJECTED")
                ? "danger"
                : "warning"
            }
            size="md"
          >
            {data.pm_final_decision || "NO_TRADE"}
          </Badge>
        </div>
      </div>

      {/* Brain Explanations */}
      <div className="px-4 py-3 border-b border-border">
        <h4 className="text-[10px] uppercase text-muted-foreground font-medium mb-3">
          Explicação por Cérebro
        </h4>
        <div className="space-y-3">
          {data.brain_explanations.map((brain) => {
            const config = brainStatusConfig(brain);
            return (
              <div
                key={brain.brain_id}
                className="rounded-md border border-border p-3"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {config.icon}
                  <span className="text-xs font-semibold text-foreground">
                    {brain.brain_name}
                  </span>
                  <Badge variant={config.variant} size="sm">
                    {config.statusLabel}
                  </Badge>
                  {brain.symbol && (
                    <Badge variant="muted" size="sm">{brain.symbol}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed pl-6">
                  {brain.skip_explanation}
                </p>
                {brain.skip_reason_code && (
                  <p className="text-[10px] font-mono text-muted-foreground/70 pl-6 mt-1">
                    Reason: {brain.skip_reason_code}
                  </p>
                )}
                {brain.timestamp && (
                  <p className="text-[10px] text-muted-foreground/50 pl-6 mt-0.5">
                    {new Date(brain.timestamp).toLocaleTimeString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Blocking Reasons */}
      {data.blocking_reasons.length > 0 && (
        <div className="px-4 py-3">
          <h4 className="text-[10px] uppercase text-muted-foreground font-medium mb-2">
            Motivos de Bloqueio
          </h4>
          <div className="space-y-1.5">
            {data.blocking_reasons.map((reason, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded border border-red-500/20 bg-red-500/5 px-3 py-2"
              >
                <div className="flex-1">
                  <p className="text-xs text-foreground">{reason.description}</p>
                  <p className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">
                    {reason.reason_code} — {reason.component}
                  </p>
                </div>
                <Badge variant="danger" size="sm">
                  {reason.count}x
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No blocking reasons */}
      {data.blocking_reasons.length === 0 && !data.had_trade && (
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground/70 italic">
            Nenhum motivo de bloqueio explícito registrado. Os cérebros podem não ter encontrado edge suficiente para gerar intents.
          </p>
        </div>
      )}
    </div>
  );
}
