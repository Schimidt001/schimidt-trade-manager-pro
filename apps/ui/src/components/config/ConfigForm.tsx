"use client";

import { useState, useEffect } from "react";
import { ReasonField } from "./ReasonField";
import { DiffPreview } from "./DiffPreview";
import { ApplyModeSelector } from "./ApplyModeSelector";
import { canAdmin, isViewer } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface ConfigFormProps {
  title: string;
  description: string;
  config: Record<string, unknown> | null;
  loading?: boolean;
  onSave: (config: Record<string, unknown>, reason: string, applyMode: string) => Promise<void>;
  armed?: boolean;
}

export function ConfigForm({
  title,
  description,
  config,
  loading,
  onSave,
  armed = false,
}: ConfigFormProps) {
  const [editedConfig, setEditedConfig] = useState<string>("");
  const [reason, setReason] = useState("");
  const [applyMode, setApplyMode] = useState("NEXT_WINDOW");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const readOnly = isViewer();
  const isAdmin = canAdmin();

  useEffect(() => {
    if (config) {
      setEditedConfig(JSON.stringify(config, null, 2));
    }
  }, [config]);

  const handleSave = async () => {
    if (readOnly || !isAdmin) return;

    setError("");
    setSuccess(false);

    if (!reason.trim() || reason.trim().length < 5) {
      setError("Motivo obrigatório (mínimo 5 caracteres)");
      return;
    }

    // Validate JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editedConfig);
    } catch {
      setError("JSON inválido. Verifique a sintaxe.");
      return;
    }

    // Guardrail: se ARMED, bloquear IMMEDIATE
    if (armed && applyMode === "IMMEDIATE") {
      setError("Sistema ARMED: modo IMMEDIATE bloqueado. Use NEXT_WINDOW.");
      return;
    }

    setSaving(true);
    try {
      await onSave(parsed, reason.trim(), applyMode);
      setSuccess(true);
      setReason("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError((err as Error).message || "Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {readOnly && (
        <div className="rounded border border-yellow-500/30 bg-yellow-500/5 px-4 py-2 text-xs text-yellow-400">
          Role Viewer: configuração em modo leitura
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Carregando configuração...
        </div>
      ) : (
        <>
          {/* Config editor */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Configuração (JSON)
            </label>
            <textarea
              value={editedConfig}
              onChange={(e) => setEditedConfig(e.target.value)}
              disabled={readOnly}
              className={cn(
                "w-full rounded-md border border-border bg-background px-4 py-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[200px]",
                readOnly && "opacity-60 cursor-not-allowed"
              )}
              rows={12}
            />
          </div>

          {/* Diff Preview */}
          {config && editedConfig && (
            <DiffPreview
              before={config}
              after={(() => {
                try {
                  return JSON.parse(editedConfig);
                } catch {
                  return null;
                }
              })()}
            />
          )}

          {/* Apply Mode */}
          {!readOnly && (
            <ApplyModeSelector
              value={applyMode}
              onChange={setApplyMode}
              armed={armed}
            />
          )}

          {/* Reason */}
          {!readOnly && (
            <ReasonField value={reason} onChange={setReason} />
          )}

          {/* Error / Success */}
          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-xs text-emerald-400">
              Configuração salva com sucesso
            </div>
          )}

          {/* Save button */}
          {!readOnly && isAdmin && (
            <button
              onClick={handleSave}
              disabled={saving || !reason.trim()}
              className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Salvando..." : "Salvar Configuração"}
            </button>
          )}

          {!readOnly && !isAdmin && (
            <p className="text-xs text-muted-foreground">
              Role Operator: apenas Admin pode alterar configurações.
            </p>
          )}
        </>
      )}
    </div>
  );
}
