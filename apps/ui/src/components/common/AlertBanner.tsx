"use client";

import { cn } from "@/lib/utils";

interface AlertBannerProps {
  variant: "info" | "warning" | "error" | "success";
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const variantStyles: Record<string, string> = {
  info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  error: "bg-red-500/10 border-red-500/30 text-red-400",
  success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
};

export function AlertBanner({ variant, children, onDismiss, className }: AlertBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border px-4 py-2 text-sm",
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-center gap-2">
        {variant === "error" && (
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )}
        {variant === "warning" && (
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )}
        <span>{children}</span>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-4 text-current opacity-60 hover:opacity-100 transition-opacity"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
