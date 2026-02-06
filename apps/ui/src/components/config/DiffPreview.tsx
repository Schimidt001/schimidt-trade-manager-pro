"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface DiffPreviewProps {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = JSON.stringify(value);
    }
  }
  return result;
}

export function DiffPreview({ before, after }: DiffPreviewProps) {
  const [open, setOpen] = useState(true);

  if (!before || !after) return null;

  const beforeFlat = flattenObject(before);
  const afterFlat = flattenObject(after);

  const allKeys = Array.from(new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]));
  const changes: Array<{
    key: string;
    before: string;
    after: string;
    type: "added" | "removed" | "changed" | "unchanged";
  }> = [];

  for (const key of allKeys) {
    const bVal = beforeFlat[key];
    const aVal = afterFlat[key];

    if (bVal === undefined) {
      changes.push({ key, before: "", after: aVal, type: "added" });
    } else if (aVal === undefined) {
      changes.push({ key, before: bVal, after: "", type: "removed" });
    } else if (bVal !== aVal) {
      changes.push({ key, before: bVal, after: aVal, type: "changed" });
    }
    // Skip unchanged
  }

  if (changes.length === 0) {
    return (
      <div className="rounded border border-border bg-card p-3 text-xs text-muted-foreground">
        Sem alterações detectadas
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/50 transition-colors"
      >
        <span>Diff Preview ({changes.length} alterações)</span>
        <svg
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-border p-3 space-y-1">
          {changes.map((change) => (
            <div
              key={change.key}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-mono",
                change.type === "added" && "bg-emerald-500/10 text-emerald-400",
                change.type === "removed" && "bg-red-500/10 text-red-400",
                change.type === "changed" && "bg-yellow-500/10 text-yellow-400"
              )}
            >
              <span className="text-muted-foreground">{change.key}: </span>
              {change.type === "changed" && (
                <>
                  <span className="line-through opacity-60">{change.before}</span>
                  <span className="mx-1">→</span>
                  <span>{change.after}</span>
                </>
              )}
              {change.type === "added" && <span>+ {change.after}</span>}
              {change.type === "removed" && <span>- {change.before}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
