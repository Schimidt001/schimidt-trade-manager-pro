"use client";

interface ReasonFieldProps {
  value: string;
  onChange: (value: string) => void;
  minLength?: number;
}

export function ReasonField({ value, onChange, minLength = 5 }: ReasonFieldProps) {
  const isValid = value.trim().length >= minLength;

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        Motivo da alteração <span className="text-red-400">*</span>
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        placeholder="Descreva o motivo desta alteração de configuração..."
        rows={2}
      />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-muted-foreground/60">
          Obrigatório para audit trail
        </span>
        {value.length > 0 && !isValid && (
          <span className="text-[10px] text-red-400">
            Mínimo {minLength} caracteres
          </span>
        )}
      </div>
    </div>
  );
}
