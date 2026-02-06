import { z } from "zod";
import {
  BrainIntentSchema,
  IntentTypeEnum,
  IntentWhyBlockSchema,
  TradePlanSchema,
  IntentConstraintsSchema,
} from "../schemas/intent.schema";

// ─────────────────────────────────────────────────────────────
// Types inferidos automaticamente do Intent Schema
// ─────────────────────────────────────────────────────────────

export type BrainIntent = z.infer<typeof BrainIntentSchema>;
export type IntentType = z.infer<typeof IntentTypeEnum>;
export type IntentWhyBlock = z.infer<typeof IntentWhyBlockSchema>;
export type TradePlan = z.infer<typeof TradePlanSchema>;
export type IntentConstraints = z.infer<typeof IntentConstraintsSchema>;
