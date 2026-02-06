"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/api";
import { ConfigForm } from "@/components/config/ConfigForm";

export default function ConfigSafetyPage() {
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

  const safetyConfig = data
    ? (data.safety as Record<string, unknown>) || data
    : null;

  return (
    <ConfigForm
      title="Safety"
      description="Configuração de segurança — kill switches, circuit breakers, limites de emergência."
      config={safetyConfig}
      loading={isLoading}
      onSave={handleSave}
      armed={opsStatus?.arm_state === "ARMED"}
    />
  );
}
