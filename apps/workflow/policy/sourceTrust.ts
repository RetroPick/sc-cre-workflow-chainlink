/**
 * Source trust scores for resolution planning.
 * Used by oracleability to rank evidence sources.
 */
import type { ResolutionSource } from "../domain/resolutionPlan";

export type ResolutionSourceType = ResolutionSource["sourceType"];

export const SOURCE_TYPE_BASE_TRUST: Record<ResolutionSourceType, number> = {
  onchain_event: 1.0,
  official_api: 0.95,
  official_website: 0.9,
  public_dataset: 0.8,
  llm_consensus: 0.55,
  manual_review: 0.4,
};
