/**
 * Resolution plan synthesis — builds plan from observation, understanding, and evidence.
 * Composes oracleability and unresolved-state verification per 03 spec.
 */
import type { SourceObservation } from "../domain/candidate";
import type { UnderstandingOutput } from "../domain/understanding";
import type { EvidenceBundle } from "../domain/evidence";
import type { ResolutionPlan } from "../domain/resolutionPlan";
import { buildOracleability } from "./oracleability";
import { verifyUnresolvedState } from "./unresolvedCheck";

export function buildResolutionPlan(
  observation: SourceObservation,
  understanding: UnderstandingOutput,
  evidence: EvidenceBundle
): ResolutionPlan {
  const oracle = buildOracleability(observation, understanding, evidence);
  const unresolved = verifyUnresolvedState(observation, understanding, evidence);

  let resolutionMode = oracle.resolutionMode;
  if (unresolved.requiresReview) {
    resolutionMode = "human_review";
  }

  return {
    resolutionMode,
    primarySources: oracle.primarySources,
    fallbackSources: oracle.fallbackSources,
    resolutionPredicate: oracle.resolutionPredicate,
    oracleabilityScore: oracle.oracleabilityScore,
    unresolvedCheckPassed: unresolved.passed,
    unresolvedCheckEvidence: unresolved.evidence,
    reasons: [
      ...oracle.reasons,
      `Unresolved check passed: ${unresolved.passed}`,
      `Unresolved review required: ${unresolved.requiresReview}`,
      `Unresolved confidence: ${unresolved.confidence.toFixed(2)}`,
    ],
  };
}
