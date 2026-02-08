"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { onSSEEvent } from "@/lib/sse";
import { GlobalStatusBar } from "@/components/cockpit/GlobalStatusBar";
import { MarketContextCard } from "@/components/cockpit/MarketContextCard";
import { ExecutionQualityCard } from "@/components/cockpit/ExecutionQualityCard";
import { TimelineCard } from "@/components/cockpit/TimelineCard";
import { BrainCard } from "@/components/cockpit/BrainCard";
import { QuickActions } from "@/components/cockpit/QuickActions";

interface OpsStatus {
  gate: string;
  arm_state: string;
  global_mode: string;
  execution_state: string;
  provider_states: Record<string, string>;
  executor_connectivity: string;
  executor_status?: {
    mode?: string;
    connected?: boolean;
    [key: string]: unknown;
  } | null;
  next_scheduled_run?: string;
}

const BRAIN_IDS = ["A2", "B3", "C3", "D2"];

export default function CockpitPage() {
  const queryClient = useQueryClient();
  const [recentEvents, setRecentEvents] = useState<Array<{
    time: string;
    label: string;
    type: string;
    status?: string;
  }>>([]);

  // Fetch ops status
  const { data: opsStatus } = useQuery<OpsStatus>({
    queryKey: ["ops-status"],
    queryFn: () => apiGet<OpsStatus>("/ops/status"),
    refetchInterval: 10_000,
  });

  // Fetch recent decisions for brain cards
  const { data: recentDecisions } = useQuery({
    queryKey: ["decisions-tail"],
    queryFn: () =>
      apiGet<{ events: Array<Record<string, unknown>> }>("/decisions/tail", {
        limit: "50",
      }),
    refetchInterval: 15_000,
  });

  // SSE events → update timeline + invalidate queries
  useEffect(() => {
    const unsub = onSSEEvent((event) => {
      // Add to timeline
      const eventData = event.data as Record<string, unknown>;
      setRecentEvents((prev) => {
        const newEvent = {
          time: event.timestamp,
          label: `${eventData?.event_type || event.type} — ${eventData?.component || "system"}`,
          type: event.type,
          status: (eventData?.severity as string) || "INFO",
        };
        return [newEvent, ...prev].slice(0, 20);
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["ops-status"] });
    });

    return unsub;
  }, [queryClient]);

  const handleActionComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["ops-status"] });
  }, [queryClient]);

  // Derive brain data from recent decisions
  const getBrainData = (brainId: string) => {
    const events = (recentDecisions?.events || []) as Array<Record<string, unknown>>;
    const brainEvents = events.filter(
      (e) => (e.brain_id as string)?.toUpperCase() === brainId
    );

    const lastIntent = brainEvents.find((e) => (e.event_type as string) === "INTENT") as Record<string, unknown> | undefined;
    const lastPm = brainEvents.find((e) => (e.event_type as string) === "PM_DECISION") as Record<string, unknown> | undefined;
    const lastEhm = brainEvents.find((e) => (e.event_type as string) === "EHM_ACTION") as Record<string, unknown> | undefined;

    // Derive status from events
    let status = "IDLE";
    if (lastEhm) {
      const ehmType = (lastEhm.action_type as string) || "";
      if (ehmType.includes("COOLDOWN")) status = "COOLDOWN";
      else if (ehmType.includes("KILL") || ehmType.includes("BLOCK")) status = "OFF";
    }
    if (lastPm) {
      const pmType = (lastPm.decision_type as string) || "";
      if (pmType.includes("ALLOWED")) status = "ACTIVE";
    }

    return {
      status,
      lastIntent: lastIntent
        ? {
            type: lastIntent.intent_type as string,
            symbol: lastIntent.symbol as string,
            timestamp: lastIntent.timestamp as string,
          }
        : null,
      lastPmDecision: lastPm
        ? {
            type: lastPm.decision_type as string,
            reason_code: lastPm.reason_code as string,
            timestamp: lastPm.timestamp as string,
          }
        : null,
      lastEhmAction: lastEhm
        ? {
            type: lastEhm.action_type as string,
            timestamp: lastEhm.timestamp as string,
          }
        : null,
      blockReasons: brainEvents
        .filter((e) => {
          const rc = (e.reason_code as string) || "";
          return rc.includes("BLOCK") || rc.includes("REJECT");
        })
        .slice(0, 5)
        .map((e) => ({
          reason_code: (e.reason_code as string) || "—",
          reason: (e.reason as string) || "—",
        })),
    };
  };

  // Derive executor mode from ops status
  const executorMode = opsStatus?.executor_status?.mode || undefined;
  const nextScheduledRun = opsStatus?.next_scheduled_run || undefined;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Cockpit</h1>
        <p className="text-sm text-muted-foreground">
          Painel central de operação — visão completa em tempo real
        </p>
      </div>

      {/* Global Status Bar (header fixo) */}
      <GlobalStatusBar
        armState={opsStatus?.arm_state || "—"}
        gate={opsStatus?.gate || "—"}
        globalMode={opsStatus?.global_mode || "—"}
        executionState={opsStatus?.execution_state || "—"}
        providerStates={opsStatus?.provider_states || {}}
        executorConnectivity={opsStatus?.executor_connectivity || "unknown"}
        executorMode={executorMode}
        nextScheduledRun={nextScheduledRun}
      />

      {/* 3 Columns Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Coluna A — Market Context + Timeline + Execution Quality */}
        <div className="space-y-4">
          <MarketContextCard mcl={null} />
          <TimelineCard events={recentEvents} />
          <ExecutionQualityCard data={null} />
        </div>

        {/* Coluna B — Controls */}
        <div className="space-y-4">
          <QuickActions
            armState={opsStatus?.arm_state || "DISARMED"}
            gate={opsStatus?.gate || "G0"}
            onActionComplete={handleActionComplete}
          />
        </div>

        {/* Coluna C — Brain Cards */}
        <div className="space-y-4">
          {BRAIN_IDS.map((id) => {
            const data = getBrainData(id);
            return (
              <BrainCard
                key={id}
                brainId={id}
                status={data.status}
                lastIntent={data.lastIntent}
                lastPmDecision={data.lastPmDecision}
                lastEhmAction={data.lastEhmAction}
                blockReasons={data.blockReasons}
                stateCheck={{
                  execution_ok: opsStatus?.execution_state === "OK",
                  event_ok: true,
                  exposure_ok: true,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
