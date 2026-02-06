import { z } from "zod";
import {
  MclSnapshotSchema,
  WhyBlockSchema,
  MarketStatesSchema,
  MarketMetricsSchema,
} from "../schemas/mcl.schema";

// ─────────────────────────────────────────────────────────────
// Types inferidos automaticamente do MCL Schema
// ─────────────────────────────────────────────────────────────

export type MclSnapshot = z.infer<typeof MclSnapshotSchema>;
export type WhyBlock = z.infer<typeof WhyBlockSchema>;
export type MarketStates = z.infer<typeof MarketStatesSchema>;
export type MarketMetrics = z.infer<typeof MarketMetricsSchema>;
