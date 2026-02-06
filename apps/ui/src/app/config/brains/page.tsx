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
    queryFn: () => apiGet<{ arm_state: string }>("/ops/status"),
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
    <ConfigForm
      title="Brains"
      description="Configuração dos brains (A2, B3, C3, D2) — parâmetros, limites e comportamento."
      config={brainsConfig}
      loading={isLoading}
      onSave={handleSave}
      armed={opsStatus?.arm_state === "ARMED"}
    />
  );
}
