import { z } from "zod";
import {
  PmDecisionSchema,
  PmDecisionTypeEnum,
  PmWhyBlockSchema,
  RiskAdjustmentsSchema,
  RiskStateSchema,
} from "../schemas/pm-decision.schema";

// ─────────────────────────────────────────────────────────────
// Types inferidos automaticamente do PM Decision Schema
// ─────────────────────────────────────────────────────────────

export type PmDecision = z.infer<typeof PmDecisionSchema>;
export type PmDecisionType = z.infer<typeof PmDecisionTypeEnum>;
export type PmWhyBlock = z.infer<typeof PmWhyBlockSchema>;
export type RiskAdjustments = z.infer<typeof RiskAdjustmentsSchema>;
export type RiskState = z.infer<typeof RiskStateSchema>;
