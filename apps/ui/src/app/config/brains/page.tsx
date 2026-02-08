"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/api";
import { ConfigForm } from "@/components/config/ConfigForm";

export default function ConfigBrainsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["config"],
    queryFn: () => apiGet<Record<string, unknown>>("/config"),
  });

  const { data: opsStatus } = useQuery({
    queryKey: ["ops-status-config"],
    queryFn: () => apiGet<{ arm_state: string; gate: string }>("/ops/status"),
  });

  const handleSave = async (
    config: Record<string, unknown>,
    reason: string,
    applyMode: string
  ) => {
    await apiPut("/config", {
      ...config,
      _reason: reason,
      _apply_mode: applyMode,
    });
    queryClient.invalidateQueries({ queryKey: ["config"] });
  };

  const brainsConfig = data
    ? (data.brains as Record<string, unknown>) || data
    : null;

  return (
    <div className="space-y-4">
      {/* Nota de transparência sobre symbols — Entrega D */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
        <div className="flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-xs font-semibold text-blue-400">Symbols geridos localmente</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Os símbolos/ativos (ex.: EURUSD, GBPUSD, USDJPY, BTCUSD) são configurados aqui no Brain config,
              <strong> não sincronizados com a plataforma principal (ainda)</strong>.
              Em Gate 0/1 isso é aceitável. A sincronização com a plataforma será implementada em fase futura.
            </p>
          </div>
        </div>
      </div>

      {/* Gate explanation — Entrega D */}
      {opsStatus?.gate === "G0" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <div>
              <h4 className="text-xs font-semibold text-amber-400">Gate G0 (Shadow Mode)</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Alterações de configuração são permitidas, mas o gate atual (G0) opera em shadow mode —
                nenhum comando será enviado ao executor. Para promover o gate, use o endpoint
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[10px]">POST /ops/gate/promote</code>
                após validar que o tick completo funciona (MCL + Brains + PM + Ledger + Executor conectado).
              </p>
            </div>
          </div>
        </div>
      )}

      <ConfigForm
        title="Brains"
        description="Configuração dos brains (A2, B3, C3, D2) — parâmetros, limites e comportamento."
        config={brainsConfig}
        loading={isLoading}
        onSave={handleSave}
        armed={opsStatus?.arm_state === "ARMED"}
      />
    </div>
  );
}
