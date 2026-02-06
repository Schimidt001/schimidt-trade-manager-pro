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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Replay</h1>
        <p className="text-sm text-muted-foreground">
          Análise forense por dia. Selecione um dia para inspecionar todos os eventos.
        </p>
      </div>

      <ReplayDayList days={data?.days || []} loading={isLoading} />
    </div>
  );
}
