"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface JsonCollapseProps {
  data: unknown;
  label?: string;
  defaultOpen?: boolean;
  className?: string;
}

export function JsonCollapse({
  data,
  label = "Payload",
  defaultOpen = false,
  className,
}: JsonCollapseProps) {
  const [open, setOpen] = useState(defaultOpen);

  const formatted = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  return (
    <div className={cn("rounded border border-border", className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg
            className={cn(
              "h-3 w-3 transition-transform",
              open && "rotate-90"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground/60">JSON</span>
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto border-t border-border bg-background/50 p-3 text-[11px] font-mono text-muted-foreground">
          {formatted}
        </pre>
      )}
    </div>
  );
}
