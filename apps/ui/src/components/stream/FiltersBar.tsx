"use client";

interface FiltersBarProps {
  filters: {
    symbol: string;
    brain_id: string;
    severity: string;
    reason_code: string;
  };
  onChange: (filters: FiltersBarProps["filters"]) => void;
}

export function FiltersBar({ filters, onChange }: FiltersBarProps) {
  const update = (key: string, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className="text-[10px] uppercase text-muted-foreground">Filters</span>

      <input
        type="text"
        placeholder="Symbol..."
        value={filters.symbol}
        onChange={(e) => update("symbol", e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-24"
      />

      <select
        value={filters.brain_id}
        onChange={(e) => update("brain_id", e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Brains</option>
        <option value="A2">A2</option>
        <option value="B3">B3</option>
        <option value="C3">C3</option>
        <option value="D2">D2</option>
      </select>

      <select
        value={filters.severity}
        onChange={(e) => update("severity", e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Severity</option>
        <option value="INFO">INFO</option>
        <option value="WARN">WARN</option>
        <option value="ERROR">ERROR</option>
      </select>

      <input
        type="text"
        placeholder="Reason code..."
        value={filters.reason_code}
        onChange={(e) => update("reason_code", e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-32"
      />

      {(filters.symbol || filters.brain_id || filters.severity || filters.reason_code) && (
        <button
          onClick={() =>
            onChange({ symbol: "", brain_id: "", severity: "", reason_code: "" })
          }
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}
