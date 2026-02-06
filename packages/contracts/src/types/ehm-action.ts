import { z } from "zod";
import {
  EhmActionSchema,
  EhmActionTypeEnum,
  CooldownScopeEnum,
  CooldownBlockSchema,
  EhmWhyBlockSchema,
} from "../schemas/ehm-action.schema";

// ─────────────────────────────────────────────────────────────
// Types inferidos automaticamente do EHM Action Schema
// ─────────────────────────────────────────────────────────────

export type EhmAction = z.infer<typeof EhmActionSchema>;
export type EhmActionType = z.infer<typeof EhmActionTypeEnum>;
export type CooldownScope = z.infer<typeof CooldownScopeEnum>;
export type CooldownBlock = z.infer<typeof CooldownBlockSchema>;
export type EhmWhyBlock = z.infer<typeof EhmWhyBlockSchema>;
