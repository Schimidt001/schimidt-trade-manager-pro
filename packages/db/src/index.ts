// ═══════════════════════════════════════════════════════════════
// @schimidt-brain/db — PONTO DE ENTRADA ÚNICO
// ═══════════════════════════════════════════════════════════════
// Persistência institucional: Ledger, Replay, Audit (PostgreSQL).
// Este pacote fornece o DAL (Data Access Layer) para o Agente 4 (API).
//
// Uso:
//   import { ledgerRepo, auditRepo, replayRepo, searchLogs, ... } from "@schimidt-brain/db";
// ═══════════════════════════════════════════════════════════════

// ─── Connection ─────────────────────────────────────────────────
export { getPool, closePool } from "./connection";

// ─── Schema / Types ─────────────────────────────────────────────
export type {
  Severity,
  Component,
  AuditAction,
  ReplayDayStatus,
  LedgerEventRow,
  LedgerEventInput,
  AuditLogRow,
  AuditLogInput,
  ReplayDayRow,
  ReplayDayInput,
  LedgerEventFilters,
  AuditLogFilters,
  SearchLogsFilters,
  TimeRange,
} from "./schema/tables";

// ─── Ledger Repository ──────────────────────────────────────────
import * as _ledgerRepo from "./repos/ledgerRepo";
export const ledgerRepo = _ledgerRepo;
export {
  insertEvent,
  insertEvents,
  listEventsByTimeRange,
  listEventsByCorrelationId,
  tailEvents,
} from "./repos/ledgerRepo";

// ─── Audit Repository ───────────────────────────────────────────
import * as _auditRepo from "./repos/auditRepo";
export const auditRepo = _auditRepo;
export {
  insertAuditLog,
  listAuditLogs,
} from "./repos/auditRepo";

// ─── Replay Repository ──────────────────────────────────────────
import * as _replayRepo from "./repos/replayRepo";
export const replayRepo = _replayRepo;
export type { ReplayDayDetail } from "./repos/replayRepo";
export {
  upsertReplayDay,
  listReplayDays,
  getReplayDay,
  deleteReplayDay,
} from "./repos/replayRepo";

// ─── Queries ────────────────────────────────────────────────────
export type { ReplayDaySummary } from "./queries/listReplayDays";
export { listReplayDaysWithCounts } from "./queries/listReplayDays";

export type { ReplayDayStats, ReplayDayFull } from "./queries/getReplayDay";
export { getReplayDayFull } from "./queries/getReplayDay";

export type { SearchLogsResult } from "./queries/searchLogs";
export { searchLogs } from "./queries/searchLogs";
