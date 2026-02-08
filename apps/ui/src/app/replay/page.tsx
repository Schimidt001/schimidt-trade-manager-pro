"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { ReplayDayList } from "@/components/replay/ReplayDayList";
import { Badge } from "@/components/common/Badge";
import { canOperate } from "@/lib/auth";

interface ReplayDaysResponse {
  count: number;
  limit: number;
  days: Array<{
    date: string;
    status: string;
    event_count?: number;
    audit_count?: number;
  }>;
}

interface DiscoverResponse {
  discovered: number;
  dates: string[];
  message: string;
}

export default function ReplayPage() {
  const queryClient = useQueryClient();
  const isOperator = canOperate();
  const [discoverFeedback, setDiscoverFeedback] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<ReplayDaysResponse>({
    queryKey: ["replay-days"],
    queryFn: () => apiGet<ReplayDaysResponse>("/replay/days"),
  });

  const discoverMutation = useMutation<DiscoverResponse>({
    mutationFn: () => apiPost<DiscoverResponse>("/replay/discover", {}),
    onSuccess: (result) => {
      setDiscoverFeedback(
        result.discovered > 0
          ? `${result.discovered} dia(s) descoberto(s): ${result.dates.join(", ")}`
          : "Nenhum dia novo descoberto. Todos os dias com eventos já estão registrados."
      );
      queryClient.invalidateQueries({ queryKey: ["replay-days"] });
      refetch();
      setTimeout(() => setDiscoverFeedback(null), 8000);
    },
    onError: (err) => {
      setDiscoverFeedback(`Erro: ${(err as Error).message}`);
      setTimeout(() => setDiscoverFeedback(null), 8000);
    },
  });

  const hasDays = data && data.days && data.days.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Replay</h1>
          <p className="text-sm text-muted-foreground">
            História do dia — análise narrativa de cada dia de operação. Selecione um dia para entender o que aconteceu, por que aconteceu e por que não aconteceu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => discoverMutation.mutate()}
            disabled={discoverMutation.isPending || !isOperator}
            title={
              isOperator
                ? "Descobre automaticamente dias com eventos no ledger e cria replay days"
                : "Requer role Operator ou Admin"
            }
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {discoverMutation.isPending ? "Descobrindo..." : "Descobrir Dias"}
          </button>
          <button
            onClick={() => refetch()}
            className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title="Atualizar lista"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Discover feedback */}
      {discoverFeedback && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <p className="text-xs text-emerald-400">{discoverFeedback}</p>
        </div>
      )}

      {/* Stats */}
      {hasDays && (
        <div className="flex items-center gap-3">
          <Badge variant="info" size="md">
            {data!.count} dia(s)
          </Badge>
          <span className="text-xs text-muted-foreground">
            Selecione um dia para ver a narrativa completa com timeline, explicação de cérebros e motivos de não-operação.
          </span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasDays && (
        <div className="rounded-lg border border-border bg-card/50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-foreground">Nenhum dia de replay disponível</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Execute um tick via <strong>Run Tick</strong> no cockpit para gerar eventos, depois clique em <strong>Descobrir Dias</strong> para criar automaticamente os replay days a partir dos eventos do ledger.
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70">
            O replay transforma eventos técnicos em uma narrativa humana do dia: o que aconteceu, por que aconteceu e por que não operamos.
          </p>
        </div>
      )}

      {/* Day list */}
      {(isLoading || hasDays) && (
        <ReplayDayList days={data?.days || []} loading={isLoading} />
      )}
    </div>
  );
}
