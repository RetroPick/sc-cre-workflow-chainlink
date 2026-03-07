/**
 * Enrichment layer — fetches context around candidate.
 * Phase 2: minimal implementation; returns observation as-is.
 * Future: fetch supporting articles, docs, chain state.
 */
import type { SourceObservation } from "../domain/candidate";
import type { UnderstandingOutput } from "../domain/understanding";

export type EnrichmentResult = {
  supportingUrls: string[];
  excerpt?: string;
};

export function enrichContext(
  _observation: SourceObservation,
  _understanding: UnderstandingOutput
): EnrichmentResult {
  return {
    supportingUrls: [],
  };
}
