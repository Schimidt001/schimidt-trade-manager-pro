"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { validateConfirmText, validateReason } from "@/lib/validators";

interface ConfirmActionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  description: string;
  confirmText: string; // Texto que o utilizador deve digitar (ex: "ARM", "DISARM", "KILL")
  requireReason?: boolean;
  variant?: "default" | "danger";
  loading?: boolean;
}

export function ConfirmActionModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  requireReason = true,
  variant = "default",
  loading = false,
}: ConfirmActionModalProps) {
  const [input, setInput] = useState("");
  const [reason, setReason] = useState("");

  if (!open) return null;

  const isConfirmValid = validateConfirmText(input, confirmText);
  const isReasonValid = !requireReason || validateReason(reason);
  const canSubmit = isConfirmValid && isReasonValid && !loading;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(reason.trim());
    setInput("");
    setReason("");
  };

  const handleClose = () => {
    setInput("");
    setReason("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <h3
          className={cn(
            "text-lg font-semibold",
            variant === "danger" ? "text-red-400" : "text-foreground"
          )}
        >
          {title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>

        {/* Campo de confirmação */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Digite <span className="font-mono font-bold text-foreground">{confirmText}</span> para confirmar
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder={confirmText}
            autoFocus
          />
        </div>

        {/* Campo de motivo */}
        {requireReason && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Motivo <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Descreva o motivo desta ação..."
              rows={2}
            />
            {reason.length > 0 && !isReasonValid && (
              <p className="mt-1 text-xs text-red-400">Mínimo 5 caracteres</p>
            )}
          </div>
        )}

        {/* Botões */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canSubmit}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              variant === "danger"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {loading ? "Processando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
