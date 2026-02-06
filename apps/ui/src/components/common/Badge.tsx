"use client";

import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "muted";
  size?: "sm" | "md";
  pulse?: boolean;
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: "bg-secondary text-secondary-foreground border-border",
  success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  danger: "bg-red-500/20 text-red-400 border-red-500/30",
  info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  muted: "bg-muted text-muted-foreground border-border",
};

export function Badge({
  children,
  variant = "default",
  size = "sm",
  pulse = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border font-mono font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
        variantStyles[variant],
        pulse && "animate-pulse-dot",
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Badge de status com dot colorido.
 */
export function StatusDot({
  status,
  label,
}: {
  status: "ok" | "warn" | "error" | "unknown";
  label?: string;
}) {
  const dotColor: Record<string, string> = {
    ok: "bg-emerald-400",
    warn: "bg-yellow-400",
    error: "bg-red-400",
    unknown: "bg-gray-400",
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn("h-2 w-2 rounded-full", dotColor[status] || dotColor.unknown)}
      />
      {label && <span>{label}</span>}
    </span>
  );
}
