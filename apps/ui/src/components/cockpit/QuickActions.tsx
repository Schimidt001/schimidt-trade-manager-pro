"use client";

import { useState, useEffect } from "react";
import { ConfirmActionModal } from "@/components/common/ConfirmActionModal";
import { apiPost, apiGet } from "@/lib/api";
import { canOperate } from "@/lib/auth";
import { cn } from "@/lib/utils";

// ─── Scenario Controller Types ──────────────────────────────────
// Cenários de teste disponíveis (G0/G1 only).
// AUTO = comportamento actual (sem override de cenário).
type TestScenario =
  | "AUTO"
  | "RANGE"
  | "TREND_CLEAN"
  | "HIGH_VOL"
  | "PRE_NEWS"
  | "POST_NEWS"
  | "LOW_LIQUIDITY"
  | "STRESS";

const SCENARIO_OPTIONS: { value: TestScenario; label: string }[] = [
  { value: "AUTO", label: "AUTO" },
  { value: "RANGE", label: "RANGE" },
  { value: "TREND_CLEAN", label: "TREND_CLEAN" },
  { value: "HIGH_VOL", label: "HIGH_VOL" },
  { value: "PRE_NEWS", label: "PRE_NEWS" },
  { value: "POST_NEWS", label: "POST_NEWS" },
  { value: "LOW_LIQUIDITY", label: "LOW_LIQUIDITY" },
  { value: "STRESS", label: "STRESS" },
];

// ─── Config Type ────────────────────────────────────────────────
interface Config {
  symbols: string[];
  gate?: string;
  [key: string]: unknown;
}

// ─── Props ──────────────────────────────────────────────────────

interface QuickActionsProps {
  armState: string;
  gate?: string;
  onActionComplete: () => void;
}

type ActionType = "ARM" | "DISARM" | "KILL" | "TICK" | null;

export function QuickActions({ armState, gate, onActionComplete }: QuickActionsProps) {
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [loading, setLoading] = useState(false);
  const [tickResult, setTickResult] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<TestScenario>("AUTO");
  const [config, setConfig] = useState<Config | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const isOperator = canOperate();
  const isShadowMode = gate === "G0";

  // Cenários só disponíveis em G0 e G1. Em G2+ o seletor desaparece.
  const isScenarioAllowed = gate === "G0" || gate === "G1";

  // Buscar config ao montar componente
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setConfigLoading(true);
        const data = await apiGet<Config>("/config");
        setConfig(data);
        setConfigError(null);
      } catch (err) {
        console.error("Failed to fetch config:", err);
        setConfigError("Erro ao carregar configuração");
      } finally {
        setConfigLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const handleConfirm = async (reason: string) => {
    if (!activeAction) return;
    setLoading(true);
    setTickResult(null);

    try {
      if (activeAction === "TICK") {
        // CORREÇÃO: Run Tick agora busca símbolos dinamicamente do config
        if (!config || !config.symbols || config.symbols.length === 0) {
          throw new Error("Configuração de símbolos não disponível");
        }

        const tickBody: { symbols: string[]; scenario?: string } = {
          symbols: config.symbols,
        };
        // Só enviar cenário se não for AUTO e se o gate permitir
        if (selectedScenario !== "AUTO" && isScenarioAllowed) {
          tickBody.scenario = selectedScenario;
        }

        const result = await apiPost<{
          correlation_id: string;
          commands_sent: number;
          scenario: string | null;
          summary: { snapshots: number; intents: number; decisions: number };
        }>("/ops/tick", tickBody);

        const scenarioLabel = result.scenario
          ? ` [${result.scenario}]`
          : "";
        setTickResult(
          `Tick executado${scenarioLabel}: ${result.summary.snapshots} snapshots, ${result.summary.intents} intents, ${result.summary.decisions} decisions. Correlation ID: ${result.correlation_id}`
        );
        setTimeout(() => setTickResult(null), 10000);

        // Reset cenário para AUTO após o tick (cenário não persiste)
        setSelectedScenario("AUTO");
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
          "Não é possível armar em G0 (Shadow Mode). Promova o gate via POST /ops/gate/promote primeiro."
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

  // ARM está desabilitado em G0 (Shadow Mode) — botão visível mas disabled com tooltip
  const armDisabled = !isOperator || isShadowMode;
  const armTooltip = !isOperator
    ? "Requer role Operator ou Admin"
    : isShadowMode
    ? "ARM indisponível em G0 (Shadow Mode). O sistema precisa estar em G1+ para armar. Promova o gate via POST /ops/gate/promote."
    : "Armar sistema — autoriza execução de comandos pelo tick/scheduler";

  // Run Tick desabilitado se config não carregou ou se não tem símbolos
  const tickDisabled = !isOperator || configLoading || !config || !config.symbols || config.symbols.length === 0;
  const tickTooltip = !isOperator
    ? "Requer role Operator ou Admin"
    : configLoading
    ? "Carregando configuração..."
    : configError
    ? `Erro ao carregar config: ${configError}`
    : !config || !config.symbols || config.symbols.length === 0
    ? "Configuração de símbolos não disponível"
    : `Executa um ciclo manual de decisão (MCL → Brains → PM).${
        selectedScenario !== "AUTO" && isScenarioAllowed
          ? ` Cenário: ${selectedScenario}`
          : ""
      } Símbolos: ${config.symbols.join(", ")}. Funciona em qualquer gate.`;

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

      {/* Config error feedback */}
      {configError && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2 mb-3">
          <p className="text-[10px] text-red-400">{configError}</p>
        </div>
      )}

      {/* Tick result feedback */}
      {tickResult && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 mb-3">
          <p className="text-[10px] text-emerald-400">{tickResult}</p>
        </div>
      )}

      <div className="space-y-2">
        {/* ARM — visível quando DISARMED, desabilitado em G0 com tooltip explicativo */}
        {(armState === "DISARMED" || armState === "—") && (
          <div className="relative group">
            <button
              onClick={() => !armDisabled && setActiveAction("ARM")}
              disabled={armDisabled}
              title={armTooltip}
              className={cn(
                "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
                !armDisabled
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-secondary text-muted-foreground cursor-not-allowed opacity-50"
              )}
            >
              ARM System
            </button>
            {/* Tooltip visual para G0 */}
            {isShadowMode && isOperator && (
              <div className="mt-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
                <p className="text-[10px] text-amber-400 leading-relaxed">
                  ARM indisponível em G0 (Shadow Mode). O pipeline executa em modo observação.
                  Para armar, promova o gate para G1+ via <code className="font-mono">POST /ops/gate/promote</code>.
                </p>
              </div>
            )}
          </div>
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

        {/* ═══ Scenario Controller (G0/G1 only) ═══ */}
        {/* Seletor de cenário de teste — só visível em G0 e G1 */}
        {/* Em G2+ este bloco inteiro desaparece da UI */}
        {isScenarioAllowed && (
          <div className="rounded border border-cyan-500/30 bg-cyan-500/5 px-3 py-2.5">
            <label
              htmlFor="test-scenario"
              className="block text-[10px] font-medium uppercase text-cyan-400 mb-1.5"
            >
              Test Scenario
            </label>
            <select
              id="test-scenario"
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value as TestScenario)}
              disabled={!isOperator}
              className={cn(
                "w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono",
                "text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/50",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {SCENARIO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {selectedScenario !== "AUTO" && (
              <p className="mt-1.5 text-[10px] text-cyan-400/80 leading-relaxed">
                Cenário <strong>{selectedScenario}</strong> será aplicado no próximo RUN TICK.
                Não persiste após execução.
              </p>
            )}
          </div>
        )}

        {/* RUN TICK — botão crítico para executar pipeline manual */}
        <button
          onClick={() => setActiveAction("TICK")}
          disabled={tickDisabled}
          title={tickTooltip}
          className={cn(
            "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
            !tickDisabled
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-secondary text-muted-foreground cursor-not-allowed opacity-50"
          )}
        >
          {configLoading ? "Loading..." : "Run Tick"}
          {!configLoading && config && config.symbols && config.symbols.length > 0 && (
            <span className="ml-2 text-[10px] font-mono opacity-80">
              [{config.symbols.length} símbolos]
            </span>
          )}
          {selectedScenario !== "AUTO" && isScenarioAllowed && !tickDisabled && (
            <span className="ml-2 text-[10px] font-mono opacity-80">
              [{selectedScenario}]
            </span>
          )}
        </button>

        {/* KILL — sempre visível */}
        <button
          onClick={() => setActiveAction("KILL")}
          disabled={!isOperator}
          title={
            isOperator
              ? "KILL ALL — encerra todas as posições e desarma sistema (RISK OFF)"
              : "Requer role Operator ou Admin"
          }
          className={cn(
            "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
            isOperator
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-secondary text-muted-foreground cursor-not-allowed"
          )}
        >
          KILL ALL
        </button>
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
        description={
          selectedScenario !== "AUTO" && isScenarioAllowed
            ? `Isto irá executar um ciclo completo de decisão com cenário ${selectedScenario}: MCL_SNAPSHOT → BRAIN_INTENT → PM_DECISION. O cenário será descartado após execução.`
            : "Isto irá executar um ciclo completo de decisão: MCL_SNAPSHOT → BRAIN_INTENT → PM_DECISION. Os eventos aparecerão em /decisions/live."
        }
        confirmText="RUN TICK"
        requireReason={false}
        loading={loading}
      />
    </div>
  );
}
