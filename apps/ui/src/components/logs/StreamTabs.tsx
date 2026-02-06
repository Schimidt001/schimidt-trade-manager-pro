"use client";

import { cn } from "@/lib/utils";

export type LogStream = "decision" | "execution" | "system" | "security";

interface StreamTabsProps {
  active: LogStream;
  onChange: (stream: LogStream) => void;
}

const TABS: { id: LogStream; label: string }[] = [
  { id: "decision", label: "Decision" },
  { id: "execution", label: "Execution" },
  { id: "system", label: "System" },
  { id: "security", label: "Security" },
];

export function StreamTabs({ active, onChange }: StreamTabsProps) {
  return (
    <div className="flex border-b border-border">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors border-b-2",
            active === tab.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
