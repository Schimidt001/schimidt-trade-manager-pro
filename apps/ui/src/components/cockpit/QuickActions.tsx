"use client";

import { useState } from "react";
import { ConfirmActionModal } from "@/components/common/ConfirmActionModal";
import { apiPost } from "@/lib/api";
import { canOperate } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface QuickActionsProps {
  armState: string;
  onActionComplete: () => void;
}

type ActionType = "ARM" | "DISARM" | "KILL" | null;

export function QuickActions({ armState, onActionComplete }: QuickActionsProps) {
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [loading, setLoading] = useState(false);
  const isOperator = canOperate();

  const handleConfirm = async (reason: string) => {
    if (!activeAction) return;
    setLoading(true);

    try {
      const endpoint =
        activeAction === "ARM"
          ? "/ops/arm"
          : activeAction === "DISARM"
          ? "/ops/disarm"
          : "/ops/kill";

      await apiPost(endpoint, { reason });
      onActionComplete();
    } catch (err) {
      console.error(`Failed to ${activeAction}:`, err);
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">
        Controls
      </h3>

      <div className="space-y-2">
        {/* ARM / DISARM */}
        {armState === "DISARMED" ? (
          <button
            onClick={() => setActiveAction("ARM")}
            disabled={!isOperator}
            className={cn(
              "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
              isOperator
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            )}
          >
            ARM System
          </button>
        ) : (
          <button
            onClick={() => setActiveAction("DISARM")}
            disabled={!isOperator}
            className={cn(
              "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
              isOperator
                ? "bg-yellow-600 text-white hover:bg-yellow-700"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            )}
          >
            DISARM System
          </button>
        )}

        {/* KILL */}
        <button
          onClick={() => setActiveAction("KILL")}
          disabled={!isOperator}
          className={cn(
            "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
            isOperator
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-secondary text-muted-foreground cursor-not-allowed"
          )}
        >
          KILL Switch
        </button>

        {/* Divider */}
        <div className="border-t border-border my-3" />

        {/* Quick actions */}
        <div className="space-y-1.5">
          <button
            disabled={!isOperator}
            className="w-full rounded border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            Pause D2
          </button>
          <button
            disabled={!isOperator}
            className="w-full rounded border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            Set RISK_OFF
          </button>
          <button
            disabled={!isOperator}
            className="w-full rounded border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            Pause Cluster
          </button>
        </div>

        {!isOperator && (
          <p className="text-[10px] text-muted-foreground/60 mt-2">
            Role Viewer: ações desabilitadas
          </p>
        )}
      </div>

      {/* ARM Modal */}
      <ConfirmActionModal
        open={activeAction === "ARM"}
        onClose={() => setActiveAction(null)}
        onConfirm={handleConfirm}
        title="Armar Sistema"
        description="O sistema passará a enviar comandos ao executor. Certifique-se de que todas as condições estão verificadas."
        confirmText="ARM"
        requireReason
        loading={loading}
      />

      {/* DISARM Modal */}
      <ConfirmActionModal
        open={activeAction === "DISARM"}
        onClose={() => setActiveAction(null)}
        onConfirm={handleConfirm}
        title="Desarmar Sistema"
        description="O sistema deixará de enviar comandos ao executor. Posições abertas não serão afetadas."
        confirmText="DISARM"
        requireReason
        loading={loading}
      />

      {/* KILL Modal */}
      <ConfirmActionModal
        open={activeAction === "KILL"}
        onClose={() => setActiveAction(null)}
        onConfirm={handleConfirm}
        title="KILL Switch"
        description="ATENÇÃO: Isto irá parar TODAS as operações imediatamente. Use apenas em emergência."
        confirmText="KILL"
        requireReason
        variant="danger"
        loading={loading}
      />
    </div>
  );
}
