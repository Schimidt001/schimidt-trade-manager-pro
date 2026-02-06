import { z } from "zod";
import {
  ExecutionStateChangeSchema,
  ExecWhyBlockSchema,
} from "../schemas/execution-state.schema";
import {
  ProviderStateChangeSchema,
  ProviderHealthEnum,
  ProvWhyBlockSchema,
} from "../schemas/provider-state.schema";
import {
  AuditLogSchema,
  AuditActorSchema,
  AuditActionEnum,
  AuditDiffSchema,
} from "../schemas/audit-log.schema";

// ─────────────────────────────────────────────────────────────
// Types inferidos automaticamente dos schemas de logs
// ─────────────────────────────────────────────────────────────

// Execution State
export type ExecutionStateChange = z.infer<typeof ExecutionStateChangeSchema>;
export type ExecWhyBlock = z.infer<typeof ExecWhyBlockSchema>;

// Provider State
export type ProviderStateChange = z.infer<typeof ProviderStateChangeSchema>;
export type ProviderHealth = z.infer<typeof ProviderHealthEnum>;
export type ProvWhyBlock = z.infer<typeof ProvWhyBlockSchema>;

// Audit Log
export type AuditLog = z.infer<typeof AuditLogSchema>;
export type AuditActor = z.infer<typeof AuditActorSchema>;
export type AuditAction = z.infer<typeof AuditActionEnum>;
export type AuditDiff = z.infer<typeof AuditDiffSchema>;
