"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/common/Badge";
import { ConfirmActionModal } from "@/components/common/ConfirmActionModal";
import { apiGet, apiPost } from "@/lib/api";
import { canAdmin } from "@/lib/auth";

// ─── Types ──────────────────────────────────────────────────────

interface OpsStatus {
  gate: string;
  arm_state: string;
  mock_mode?: boolean;
  risk_off?: boolean;
  executor_connectivity: string;
  executor_status?: {
    mode?: string;
    connected?: boolean;
    [key: string]: unknown;
  } | null;
  last_tick_result: {
    has_mcl_snapshot: boolean;
    has_brain_intent_or_skip: boolean;
    has_pm_decision: boolean;
    events_persisted: number;
  } | null;
}

interface ReplayDaysResponse {
  count: number;
  days: Array<{
    date: string;
    status: string;
    event_count?: number;
  }>;
}

interface PrereqCheck {
  id: string;
  label: string;
  description: string;
  passed: boolean;
  detail: string;
}

interface GatePromotionPanelProps {
  opsStatus: OpsStatus | null | undefined;
  onActionComplete: () => void;
}

// ─── Gate Labels ────────────────────────────────────────────────

const GATE_LABELS: Record<string, string> = {
  G0: "G0 — Shadow Mode (observação)",
  G1: "G1 — Paper Trading (simulação)",
  G2: "G2 — Live Restricted (limites reduzidos)",
  G3: "G3 — Live Full (execução plena)",
};

const GATE_ORDER = ["G0", "G1", "G2", "G3"];

// ─── Component ──────────────────────────────────────────────────

export function GatePromotionPanel({ opsStatus, onActionComplete }: GatePromotionPanelProps) {
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showDemoteModal, setShowDemoteModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [replayDays, setReplayDays] = useState<ReplayDaysResponse | null>(null);
  const [prereqs, setPrereqs] = useState<PrereqCheck[]>([]);

  const isAdmin = canAdmin();
  const currentGate = opsStatus?.gate || "G0";
  const currentGateIdx = GATE_ORDER.indexOf(currentGate);
  const nextGate = currentGateIdx < GATE_ORDER.length - 1 ? GATE_ORDER[currentGateIdx + 1] : null;
  const prevGate = currentGateIdx > 0 ? GATE_ORDER[currentGateIdx - 1] : null;

  // Fetch replay days for prereq check
  const fetchReplayDays = useCallback(async () => {
    try {
      const data = await apiGet<ReplayDaysResponse>("/replay/days", { limit: "7" });
      setReplayDays(data);
    } catch {
      setReplayDays(null);
    }
  }, []);

  useEffect(() => {
    fetchReplayDays();
  }, [fetchReplayDays]);

  // Build prerequisites checklist
  useEffect(() => {
    if (!opsStatus) return;

    const checks: PrereqCheck[] = [];
    const tickResult = opsStatus.last_tick_result;

    // 1. Replay existente
    const hasReplay = replayDays !== null && replayDays.count > 0;
    checks.push({
      id: "replay",
      label: "Replay existente",
      description: "Pelo menos 1 dia de replay disponível com eventos",
      passed: hasReplay,
      detail: hasReplay
        ? `${replayDays!.count} dia(s) disponível(is)`
        : "Nenhum dia de replay encontrado. Execute um tick primeiro.",
    });

    // 2. Tick gera MCL_SNAPSHOT
    const hasMcl = tickResult?.has_mcl_snapshot === true;
    checks.push({
      id: "mcl_snapshot",
      label: "Tick gera MCL_SNAPSHOT",
      description: "O último tick produziu pelo menos um snapshot de mercado",
      passed: hasMcl,
      detail: hasMcl
        ? "MCL_SNAPSHOT gerado com sucesso"
        : "MCL_SNAPSHOT não gerado. Execute /ops/tick para validar.",
    });

    // 3. Tick gera BRAIN_INTENT ou BRAIN_SKIP
    const hasBrain = tickResult?.has_brain_intent_or_skip === true;
    checks.push({
      id: "brain_intent",
      label: "Tick gera BRAIN_INTENT ou BRAIN_SKIP",
      description: "Os cérebros processaram e geraram intent ou skip",
      passed: hasBrain,
      detail: hasBrain
        ? "Brain processou corretamente"
        : "Nenhum BRAIN_INTENT ou BRAIN_SKIP gerado. Execute /ops/tick.",
    });

    // 4. Tick gera PM_DECISION
    const hasPm = tickResult?.has_pm_decision === true;
    checks.push({
      id: "pm_decision",
      label: "Tick gera PM_DECISION",
      description: "O Portfolio Manager emitiu decisão",
      passed: hasPm,
      detail: hasPm
        ? "PM_DECISION gerado com sucesso"
        : "PM_DECISION não gerado. Execute /ops/tick.",
    });

    // 5. Ledger funcional
    const hasLedger = tickResult !== null && tickResult.events_persisted > 0;
    checks.push({
      id: "ledger",
      label: "Ledger funcional",
      description: "Eventos estão sendo persistidos no ledger",
      passed: hasLedger,
      detail: hasLedger
        ? `${tickResult!.events_persisted} evento(s) persistido(s)`
        : "Nenhum evento persistido. Verifique a conexão com o banco de dados.",
    });

    // 6. Executor conectado
    const hasExecutor = opsStatus.executor_connectivity === "connected";
    checks.push({
      id: "executor",
      label: "Executor conectado",
      description: "O executor (simulator ou real) está acessível",
      passed: hasExecutor,
      detail: hasExecutor
        ? `Conectado (modo: ${opsStatus.executor_status?.mode || "—"})`
        : `Executor ${opsStatus.executor_connectivity || "desconhecido"}. Verifique o executor.`,
    });

    // 7. RBAC (Admin)
    checks.push({
      id: "rbac",
      label: "RBAC — Role Admin",
      description: "Apenas administradores podem promover gates",
      passed: isAdmin,
      detail: isAdmin
        ? "Role Admin confirmada"
        : "Role insuficiente. Requer Admin para promover gate.",
    });

    setPrereqs(checks);
  }, [opsStatus, replayDays, isAdmin]);

  const allPrereqsPassed = prereqs.length > 0 && prereqs.every((p) => p.passed);
  const canPromote = isAdmin && nextGate !== null && allPrereqsPassed;

  // Handle promote
  const handlePromote = async (reason: string) => {
    if (!nextGate) return;
    setLoading(true);
    setFeedback(null);

    try {
      const result = await apiPost<{
        status: string;
        from_gate: string;
        to_gate: string;
        message: string;
        missing_prerequisites?: Array<{ reason_code: string; message: string }>;
      }>("/ops/gate/promote", {
        to_gate: nextGate,
        confirm: "PROMOTE_GATE",
        reason,
      });

      setFeedback({
        type: "success",
        message: result.message || `Gate promovido para ${nextGate} com sucesso!`,
      });
      onActionComplete();
    } catch (err) {
      const apiError = err as { status?: number; body?: { message?: string; missing_prerequisites?: Array<{ reason_code: string; message: string }> } };

      if (apiError.status === 409 && apiError.body?.missing_prerequisites) {
        const missing = apiError.body.missing_prerequisites
          .map((p) => `• ${p.message}`)
          .join("\n");
        setFeedback({
          type: "error",
          message: `Promoção bloqueada:\n${missing}`,
        });
      } else if (apiError.status === 403) {
        setFeedback({
          type: "error",
          message: "Permissão negada. Requer role Admin.",
        });
      } else {
        setFeedback({
          type: "error",
          message: apiError.body?.message || (err as Error).message || "Erro desconhecido",
        });
      }
    } finally {
      setLoading(false);
      setShowPromoteModal(false);
    }
  };

  // Handle demote
  const handleDemote = async (reason: string) => {
    if (!prevGate) return;
    setLoading(true);
    setFeedback(null);

    try {
      const result = await apiPost<{
        status: string;
        from_gate: string;
        to_gate: string;
        message: string;
      }>("/ops/gate/promote", {
        to_gate: prevGate,
        confirm: "PROMOTE_GATE",
        reason,
      });

      setFeedback({
        type: "success",
        message: result.message || `Gate demovido para ${prevGate}`,
      });
      onActionComplete();
    } catch (err) {
      const apiError = err as { status?: number; body?: { message?: string } };
      setFeedback({
        type: "error",
        message: apiError.body?.message || (err as Error).message || "Erro desconhecido",
      });
    } finally {
      setLoading(false);
      setShowDemoteModal(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Gate Promotion</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Ritual institucional de promoção de gate
            </p>
          </div>
          <Badge
            variant={
              currentGate === "G3" ? "success" :
              currentGate === "G2" ? "warning" :
              currentGate === "G1" ? "info" : "muted"
            }
            size="md"
          >
            {currentGate}
          </Badge>
        </div>
      </div>

      {/* Current Gate Info */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground font-medium">Gate Atual:</span>
          <span className="text-xs text-foreground font-medium">
            {GATE_LABELS[currentGate] || currentGate}
          </span>
        </div>
        {nextGate && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] uppercase text-muted-foreground font-medium">Próximo:</span>
            <span className="text-xs text-foreground font-medium">
              {GATE_LABELS[nextGate] || nextGate}
            </span>
          </div>
        )}
      </div>

      {/* Gate Progress Bar */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-1">
          {GATE_ORDER.map((gate, idx) => {
            const isCurrent = gate === currentGate;
            const isPassed = idx < currentGateIdx;
            return (
              <div key={gate} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "h-2 w-full rounded-full transition-colors",
                    isCurrent && "bg-primary",
                    isPassed && "bg-emerald-500",
                    !isCurrent && !isPassed && "bg-secondary"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-mono",
                    isCurrent ? "text-primary font-bold" :
                    isPassed ? "text-emerald-400" : "text-muted-foreground"
                  )}
                >
                  {gate}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Prerequisites Checklist */}
      {nextGate && (
        <div className="px-4 py-3 border-b border-border">
          <h4 className="text-[10px] uppercase text-muted-foreground font-medium mb-2">
            Checklist de Validação para {nextGate}
          </h4>
          <div className="space-y-2">
            {prereqs.map((prereq) => (
              <div
                key={prereq.id}
                className={cn(
                  "rounded-md border p-2.5 transition-colors",
                  prereq.passed
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-red-500/20 bg-red-500/5"
                )}
              >
                <div className="flex items-center gap-2">
                  {prereq.passed ? (
                    <svg className="h-4 w-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <div className="flex-1">
                    <p className="text-xs font-medium text-foreground">{prereq.label}</p>
                    <p className="text-[10px] text-muted-foreground">{prereq.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {prereqs.filter((p) => p.passed).length} / {prereqs.length} pré-requisitos atendidos
            </span>
            {allPrereqsPassed && (
              <Badge variant="success" size="sm">PRONTO</Badge>
            )}
          </div>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={cn(
          "px-4 py-3 border-b border-border",
          feedback.type === "success" ? "bg-emerald-500/5" : "bg-red-500/5"
        )}>
          <p className={cn(
            "text-xs whitespace-pre-line",
            feedback.type === "success" ? "text-emerald-400" : "text-red-400"
          )}>
            {feedback.message}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 space-y-2">
        {/* Promote Button */}
        {nextGate && (
          <button
            onClick={() => setShowPromoteModal(true)}
            disabled={!canPromote || loading}
            title={
              !isAdmin
                ? "Requer role Admin"
                : !allPrereqsPassed
                ? "Pré-requisitos não atendidos. Verifique o checklist acima."
                : `Promover gate de ${currentGate} para ${nextGate}`
            }
            className={cn(
              "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
              canPromote && !loading
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-secondary text-muted-foreground cursor-not-allowed opacity-50"
            )}
          >
            {loading ? "Processando..." : `Promote to ${nextGate}`}
          </button>
        )}

        {/* Demote Button */}
        {prevGate && (
          <button
            onClick={() => setShowDemoteModal(true)}
            disabled={!isAdmin || loading}
            title={
              !isAdmin
                ? "Requer role Admin"
                : `Demover gate de ${currentGate} para ${prevGate}`
            }
            className={cn(
              "w-full rounded-md border border-border px-4 py-2 text-xs text-muted-foreground transition-colors",
              isAdmin && !loading
                ? "hover:bg-secondary hover:text-foreground"
                : "cursor-not-allowed opacity-50"
            )}
          >
            Demover para {prevGate}
          </button>
        )}

        {/* At max gate */}
        {!nextGate && (
          <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <p className="text-xs text-emerald-400 text-center">
              Gate máximo atingido — {currentGate} (Live Full)
            </p>
          </div>
        )}

        {/* Not admin warning */}
        {!isAdmin && (
          <p className="text-[10px] text-muted-foreground/60 text-center mt-1">
            Role Admin necessária para promover ou demover gates
          </p>
        )}
      </div>

      {/* Promote Modal */}
      <ConfirmActionModal
        open={showPromoteModal}
        onClose={() => setShowPromoteModal(false)}
        onConfirm={handlePromote}
        title={`Promover Gate: ${currentGate} → ${nextGate}`}
        description={`Você está prestes a promover o sistema de ${GATE_LABELS[currentGate] || currentGate} para ${GATE_LABELS[nextGate || ""] || nextGate}. Esta ação será registrada no audit log. Certifique-se de que todos os pré-requisitos foram verificados e que você entende as implicações desta promoção.`}
        confirmText="PROMOTE_GATE"
        requireReason
        loading={loading}
      />

      {/* Demote Modal */}
      <ConfirmActionModal
        open={showDemoteModal}
        onClose={() => setShowDemoteModal(false)}
        onConfirm={handleDemote}
        title={`Demover Gate: ${currentGate} → ${prevGate}`}
        description={`Você está prestes a demover o sistema de ${GATE_LABELS[currentGate] || currentGate} para ${GATE_LABELS[prevGate || ""] || prevGate}. ${prevGate === "G0" ? "O sistema será desarmado automaticamente e voltará ao modo Shadow." : "O nível de execução será reduzido."}`}
        confirmText="PROMOTE_GATE"
        requireReason
        loading={loading}
      />
    </div>
  );
}
