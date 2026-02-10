"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/common/Badge";
import { apiDelete } from "@/lib/api";

interface ReplayDay {
  date: string;
  status: string;
  event_count?: number;
  audit_count?: number;
}

interface ReplayDayListProps {
  days: ReplayDay[];
  loading?: boolean;
  onDayDeleted?: (date: string) => void;
}

export function ReplayDayList({ days, loading, onDayDeleted }: ReplayDayListProps) {
  const [deletingDate, setDeletingDate] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Carregando dias de replay...
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Nenhum dia de replay disponível.
      </div>
    );
  }

  const handleDelete = async (date: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (!confirm(`Tem certeza que deseja deletar o replay do dia ${date}?\n\nIsso irá remover:\n- Entrada em replay_days\n- Todos os ledger_events do dia\n- Todos os audit_logs do dia\n\nEsta ação não pode ser desfeita.`)) {
      return;
    }

    setDeletingDate(date);

    try {
      await apiDelete(`/replay/${date}`);
      
      // Notificar componente pai que o dia foi deletado
      if (onDayDeleted) {
        onDayDeleted(date);
      }
    } catch (err) {
      console.error("Erro ao deletar replay:", err);
      alert(`Erro ao deletar replay: ${err instanceof Error ? err.message : "Erro desconhecido"}`);
    } finally {
      setDeletingDate(null);
    }
  };

  return (
    <div className="space-y-2">
      {days.map((day) => (
        <div
          key={day.date}
          className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:bg-secondary/20 transition-colors"
        >
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm font-medium text-foreground">
              {day.date}
            </span>
            <Badge
              variant={
                day.status === "complete"
                  ? "success"
                  : day.status === "partial"
                  ? "warning"
                  : "muted"
              }
            >
              {day.status}
            </Badge>
            {day.event_count !== undefined && (
              <span className="text-xs text-muted-foreground">
                {day.event_count} eventos
              </span>
            )}
            {day.audit_count !== undefined && (
              <span className="text-xs text-muted-foreground">
                {day.audit_count} audit
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/replay/${day.date}`}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
            >
              Open
            </Link>
            
            <button
              onClick={(e) => handleDelete(day.date, e)}
              disabled={deletingDate === day.date}
              className="rounded-md border border-destructive px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Deletar replay e todos os eventos do dia"
            >
              {deletingDate === day.date ? "Deletando..." : "Delete"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
