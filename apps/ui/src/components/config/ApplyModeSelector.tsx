"use client";

import { cn } from "@/lib/utils";

interface ApplyModeSelectorProps {
  value: string;
  onChange: (mode: string) => void;
  armed?: boolean;
}

const MODES = [
  {
    id: "NEXT_WINDOW",
    label: "Next Window",
    description: "Aplica na próxima janela de trading",
  },
  {
    id: "NEXT_CYCLE",
    label: "Next Cycle",
    description: "Aplica no próximo ciclo de decisão",
  },
  {
    id: "IMMEDIATE",
    label: "Immediate",
    description: "Aplica imediatamente (bloqueado se ARMED)",
  },
];

export function ApplyModeSelector({ value, onChange, armed }: ApplyModeSelectorProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-2">
        Apply Mode
      </label>
      <div className="flex gap-2">
        {MODES.map((mode) => {
          const isDisabled = armed && mode.id === "IMMEDIATE";
          const isSelected = value === mode.id;

          return (
            <button
              key={mode.id}
              onClick={() => !isDisabled && onChange(mode.id)}
              disabled={isDisabled}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary",
                isDisabled && "opacity-40 cursor-not-allowed"
              )}
            >
              <div className="text-xs font-medium">{mode.label}</div>
              <div className="text-[10px] mt-0.5 opacity-70">{mode.description}</div>
              {isDisabled && (
                <div className="text-[10px] text-red-400 mt-1">
                  Bloqueado (ARMED)
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
