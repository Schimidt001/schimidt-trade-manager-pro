"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { ReplayDayList } from "@/components/replay/ReplayDayList";

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

export default function ReplayPage() {
  const { data, isLoading } = useQuery<ReplayDaysResponse>({
    queryKey: ["replay-days"],
    queryFn: () => apiGet<ReplayDaysResponse>("/replay/days"),
  });

  const hasDays = data && data.days && data.days.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Replay</h1>
        <p className="text-sm text-muted-foreground">
          Análise forense por dia. Selecione um dia para inspecionar todos os eventos.
        </p>
      </div>

      {!isLoading && !hasDays && (
        <div className="rounded-lg border border-border bg-card/50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-foreground">Replay diário indisponível</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            O agregador diário ainda não foi executado. Nenhum dia com dados consolidados disponível.
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70">
            <strong>Componente necessário:</strong> Agregador de replay (executado à parte, fora do tick).
            Quando ativo, este painel mostrará os dias com eventos para inspeção forense.
          </p>
        </div>
      )}

      {(isLoading || hasDays) && (
        <ReplayDayList days={data?.days || []} loading={isLoading} />
      )}
    </div>
  );
}
