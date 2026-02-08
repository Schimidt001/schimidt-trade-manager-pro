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

type ActionType = "ARM" | "DISARM" | "KILL" | "TICK" | null;

export function QuickActions({ armState, onActionComplete }: QuickActionsProps) {
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [loading, setLoading] = useState(false);
  const [tickResult, setTickResult] = useState<string | null>(null);
  const isOperator = canOperate();

  const handleConfirm = async (reason: string) => {
    if (!activeAction) return;
    setLoading(true);
    setTickResult(null);

    try {
      if (activeAction === "TICK") {
        // Run Tick — envia lista de símbolos default
        const result = await apiPost<{
          correlation_id: string;
          commands_sent: number;
          summary: { snapshots: number; intents: number; decisions: number };
        }>("/ops/tick", {
          symbols: ["EURUSD", "GBPUSD", "USDJPY", "BTCUSD"],
        });
        setTickResult(
          `Tick executado: ${result.summary.snapshots} snapshots, ${result.summary.intents} intents, ${result.summary.decisions} decisions. Correlation ID: ${result.correlation_id}`
        );
        setTimeout(() => setTickResult(null), 10000);
      } else {
        // ARM / DISARM / KILL
        const endpoint =
          activeAction === "ARM"
            ? "/ops/arm"
            : activeAction === "DISARM"
            ? "/ops/disarm"
            : "/ops/kill";

        await apiPost(endpoint, { confirm: activeAction, reason });
      }
      onActionComplete();
    } catch (err) {
      console.error(`Failed to ${activeAction}:`, err);
      
      // Tratamento específico para erro 409 (Conflict) no ARM
      const apiError = err as { status?: number; body?: { message?: string } };
      if (activeAction === "ARM" && apiError.status === 409) {
        setTickResult(
          "Não é possível armar em G0 (Shadow Mode). Mude o gate via /config primeiro."
        );
      } else {
        setTickResult(
          `Erro ${apiError.status || ""}: ${apiError.body?.message || (err as Error).message}`
        );
      }
      setTimeout(() => setTickResult(null), 8000);
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  // Quick action handler genérico (placeholder para endpoints futuros)
  const handleQuickAction = async (action: string) => {
    try {
      switch (action) {
        case "RISK_OFF":
          await apiPost("/ops/kill", { confirm: "KILL", reason: "RISK_OFF ativado via Quick Action" });
          break;
        case "PAUSE_D2":
          console.info("[QuickAction] Pause News Brain (D2) — endpoint pendente");
          break;
        case "FREEZE_CONFIG":
          console.info("[QuickAction] Freeze Config — endpoint pendente");
          break;
        case "RESUME_CONFIG":
          console.info("[QuickAction] Resume Config — endpoint pendente");
          break;
      }
      onActionComplete();
    } catch (err) {
      console.error(`Quick action ${action} failed:`, err);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-medium uppercase text-muted-foreground mb-3">
        Controles Operacionais
      </h3>

      {/* Aviso conceitual obrigatório — Seção 8 das diretrizes */}
      <div className="rounded border border-primary/20 bg-primary/5 px-3 py-2 mb-3">
        <p className="text-[10px] text-primary/80 leading-relaxed">
          <strong>ARM apenas AUTORIZA</strong> — não executa lógica nem trades.
          Quem executa: <span className="font-mono">/ops/tick</span> (manual) ou Scheduler (automático).
        </p>
      </div>

      {/* Tick result feedback */}
      {tickResult && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 mb-3">
          <p className="text-[10px] text-emerald-400">{tickResult}</p>
        </div>
      )}

      <div className="space-y-2">
        {/* ARM — sempre visível quando DISARMED */}
        {(armState === "DISARMED" || armState === "—") && (
          <button
            onClick={() => setActiveAction("ARM")}
            disabled={!isOperator}
            title={
              isOperator
                ? "Armar sistema — autoriza execução de comandos pelo tick/scheduler"
                : "Requer role Operator ou Admin"
            }
            className={cn(
              "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
              isOperator
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            )}
          >
            ARM System
          </button>
        )}

        {/* DISARM — sempre visível quando ARMED */}
        {armState === "ARMED" && (
          <button
            onClick={() => setActiveAction("DISARM")}
            disabled={!isOperator}
            title={
              isOperator
                ? "Desarmar sistema — revoga autorização de execução"
                : "Requer role Operator ou Admin"
            }
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

        {/* RUN TICK — botão crítico para executar pipeline manual */}
        <button
          onClick={() => setActiveAction("TICK")}
          disabled={!isOperator}
          title={
            isOperator
              ? "Executa um ciclo manual de decisão (MCL → Brains → PM → EHM). Requer sistema ARMED."
              : "Requer role Operator ou Admin"
          }
          className={cn(
            "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
            isOperator
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-secondary text-muted-foreground cursor-not-allowed"
          )}
        >
          Run Tick
        </button>

        {/* KILL */}
        <button
          onClick={() => setActiveAction("KILL")}
          disabled={!isOperator}
          title={
            isOperator
              ? "Kill Switch — RISK_OFF + DISARM imediato. Use apenas em emergência."
              : "Requer role Operator ou Admin"
          }
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

        {/* Quick Actions — Seção 5 das diretrizes */}
        <h4 className="text-[10px] font-medium uppercase text-muted-foreground mb-1.5">
          Quick Actions
        </h4>
        <div className="space-y-1.5">
          <button
            onClick={() => handleQuickAction("RISK_OFF")}
            disabled={!isOperator}
            title="Ativa modo RISK_OFF — para todas as operações e entra em modo defensivo. Equivale a KILL."
            className="w-full rounded border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            Set RISK_OFF
          </button>
          <button
            onClick={() => handleQuickAction("PAUSE_D2")}
            disabled={!isOperator}
            title="Pausa o Brain D2 (News Brain) — impede que notícias gerem intents até ser retomado. Backend pendente."
            className="w-full rounded border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            Pause News Brain (D2)
          </button>
          <button
            onClick={() => handleQuickAction("FREEZE_CONFIG")}
            disabled={!isOperator}
            title="Congela a configuração atual — impede qualquer alteração de config até ser desbloqueado. Backend pendente."
            className="w-full rounded border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            Freeze Config
          </button>
          <button
            onClick={() => handleQuickAction("RESUME_CONFIG")}
            disabled={!isOperator}
            title="Desbloqueia a configuração — permite alterações de config novamente. Backend pendente."
            className="w-full rounded border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
          >
            Resume Config
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
        description="ARM apenas AUTORIZA o sistema a executar comandos quando o tick ou scheduler for acionado. ARM não executa trades diretamente. Certifique-se de que todas as condições estão verificadas."
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
        description="DISARM revoga a autorização de execução. O sistema deixará de autorizar novos comandos ao executor. Posições abertas não serão afetadas."
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
        description="ATENÇÃO: Isto irá ativar RISK_OFF e DISARM imediatamente. Todas as autorizações serão revogadas e o sistema entrará em modo defensivo. Use apenas em emergência."
        confirmText="KILL"
        requireReason
        variant="danger"
        loading={loading}
      />

      {/* TICK Modal — sem reason obrigatório */}
      <ConfirmActionModal
        open={activeAction === "TICK"}
        onClose={() => setActiveAction(null)}
        onConfirm={() => handleConfirm("")}
        title="Executar Tick Manual"
        description="Isto irá executar um ciclo completo de decisão: MCL_SNAPSHOT → BRAIN_INTENT → PM_DECISION → EHM_ACTION. Os eventos aparecerão em /decisions/live. Sistema deve estar ARMED."
        confirmText="RUN TICK"
        requireReason={false}
        loading={loading}
      />
    </div>
  );
}
