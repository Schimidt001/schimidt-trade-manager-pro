"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/common/Badge";
import { JsonCollapse } from "@/components/common/JsonCollapse";

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

interface ReplayNarrativeTimelineProps {
  timeline: NarrativeTimelineEntry[];
  date: string;
}

// ─── Category Config ────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, {
  label: string;
  color: string;
  dotColor: string;
  lineColor: string;
  bgColor: string;
  icon: string;
}> = {
  mcl: {
    label: "MCL",
    color: "text-blue-400",
    dotColor: "bg-blue-400",
    lineColor: "border-blue-400/30",
    bgColor: "bg-blue-500/5 border-blue-500/20",
    icon: "M",
  },
  brain_action: {
    label: "Brain Intent",
    color: "text-emerald-400",
    dotColor: "bg-emerald-400",
    lineColor: "border-emerald-400/30",
    bgColor: "bg-emerald-500/5 border-emerald-500/20",
    icon: "B",
  },
  brain_skip: {
    label: "Brain Skip",
    color: "text-yellow-400",
    dotColor: "bg-yellow-400",
    lineColor: "border-yellow-400/30",
    bgColor: "bg-yellow-500/5 border-yellow-500/20",
    icon: "S",
  },
  pm_decision: {
    label: "PM Decision",
    color: "text-purple-400",
    dotColor: "bg-purple-400",
    lineColor: "border-purple-400/30",
    bgColor: "bg-purple-500/5 border-purple-500/20",
    icon: "P",
  },
  ops_action: {
    label: "Ops Action",
    color: "text-orange-400",
    dotColor: "bg-orange-400",
    lineColor: "border-orange-400/30",
    bgColor: "bg-orange-500/5 border-orange-500/20",
    icon: "O",
  },
  system: {
    label: "System",
    color: "text-gray-400",
    dotColor: "bg-gray-400",
    lineColor: "border-gray-400/30",
    bgColor: "bg-gray-500/5 border-gray-500/20",
    icon: "S",
  },
  audit: {
    label: "Audit",
    color: "text-cyan-400",
    dotColor: "bg-cyan-400",
    lineColor: "border-cyan-400/30",
    bgColor: "bg-cyan-500/5 border-cyan-500/20",
    icon: "A",
  },
};

// ─── Filter Categories ──────────────────────────────────────────

type FilterCategory = "all" | "mcl" | "brain_action" | "brain_skip" | "pm_decision" | "ops_action" | "system" | "audit";

const FILTER_OPTIONS: { value: FilterCategory; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "mcl", label: "MCL" },
  { value: "brain_action", label: "Brain Intent" },
  { value: "brain_skip", label: "Brain Skip" },
  { value: "pm_decision", label: "PM Decision" },
  { value: "ops_action", label: "Ops" },
  { value: "system", label: "System" },
  { value: "audit", label: "Audit" },
];

// ─── Severity Badge ─────────────────────────────────────────────

function severityVariant(severity: string): "success" | "warning" | "danger" | "info" | "muted" {
  switch (severity?.toUpperCase()) {
    case "ERROR":
      return "danger";
    case "WARN":
      return "warning";
    case "INFO":
      return "info";
    default:
      return "muted";
  }
}

// ─── Component ──────────────────────────────────────────────────

export function ReplayNarrativeTimeline({ timeline, date }: ReplayNarrativeTimelineProps) {
  const [filter, setFilter] = useState<FilterCategory>("all");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const filteredTimeline = filter === "all"
    ? timeline
    : timeline.filter((entry) => entry.category === filter);

  // Count by category
  const categoryCounts: Record<string, number> = {};
  for (const entry of timeline) {
    categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Timeline Narrativa — {date}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {timeline.length} eventos em sequência cronológica
            </p>
          </div>
          <Badge variant="info" size="md">
            {filteredTimeline.length} / {timeline.length}
          </Badge>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {FILTER_OPTIONS.map((opt) => {
            const count = opt.value === "all" ? timeline.length : (categoryCounts[opt.value] || 0);
            const isActive = filter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-medium transition-colors border",
                  isActive
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                )}
              >
                {opt.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeline */}
      <div className="max-h-[600px] overflow-y-auto">
        {filteredTimeline.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum evento nesta categoria
          </div>
        ) : (
          <div className="relative px-4 py-3">
            {/* Vertical line */}
            <div className="absolute left-[2.1rem] top-0 bottom-0 w-px bg-border" />

            {filteredTimeline.map((entry, idx) => {
              const config = CATEGORY_CONFIG[entry.category] || CATEGORY_CONFIG.system;
              const isExpanded = expandedIdx === idx;

              return (
                <div
                  key={idx}
                  className="relative pl-8 pb-4 last:pb-0"
                >
                  {/* Dot */}
                  <div
                    className={cn(
                      "absolute left-[1.35rem] top-1.5 h-3 w-3 rounded-full border-2 border-card z-10",
                      config.dotColor
                    )}
                  />

                  {/* Event card */}
                  <div
                    className={cn(
                      "rounded-md border p-3 cursor-pointer transition-all hover:shadow-sm",
                      config.bgColor,
                      isExpanded && "ring-1 ring-primary/30"
                    )}
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  >
                    {/* Time + Category + Severity */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-semibold text-foreground">
                        {entry.time}
                      </span>
                      <Badge
                        variant={severityVariant(entry.severity)}
                        size="sm"
                      >
                        {entry.severity}
                      </Badge>
                      <span className={cn("text-[10px] font-medium", config.color)}>
                        {config.label}
                      </span>
                      {entry.symbol && (
                        <Badge variant="muted" size="sm">
                          {entry.symbol}
                        </Badge>
                      )}
                      {entry.brain_id && (
                        <Badge variant="info" size="sm">
                          {entry.brain_id}
                        </Badge>
                      )}
                    </div>

                    {/* Narrative text */}
                    <p className="mt-1.5 text-xs text-foreground leading-relaxed">
                      {entry.narrative}
                    </p>

                    {/* Reason code */}
                    {entry.reason_code && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {entry.reason_code}
                        </span>
                        {entry.reason_description && (
                          <span className="text-[10px] text-muted-foreground/70">
                            — {entry.reason_description}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Expanded: key_data */}
                    {isExpanded && Object.keys(entry.key_data).length > 0 && (
                      <div className="mt-3 border-t border-border/50 pt-3">
                        <JsonCollapse
                          data={entry.key_data}
                          label="Dados-chave"
                          defaultOpen={true}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
