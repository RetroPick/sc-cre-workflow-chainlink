/**
 * Demo mock resolution plan builder — deterministic per DEMO.md.
 * Returns a valid ResolutionPlan without calling oracleability or unresolvedCheck.
 */
import type { SourceObservation } from "../../src/domain/candidate";
import type { UnderstandingOutput } from "../../src/domain/understanding";
import type { EvidenceBundle } from "../../src/domain/evidence";
import type { ResolutionPlan } from "../../src/domain/resolutionPlan";

export function mockBuildResolutionPlan(
  _obs: SourceObservation,
  understanding: UnderstandingOutput,
  evidence: EvidenceBundle
): ResolutionPlan {
  const primary = evidence.primary.slice(0, 2).map((e) => ({
    sourceType: "official_api" as const,
    locator: e.url,
    trustScore: e.trustScore,
  }));

  const oracleabilityScore = understanding.category === "politics" || understanding.category === "sports" ? 0.3 : 0.85;
  const unresolvedCheckPassed = understanding.category !== "politics" && understanding.category !== "sports";

  return {
    resolutionMode: unresolvedCheckPassed ? "deterministic" : "human_review",
    primarySources: primary,
    fallbackSources: [],
    resolutionPredicate: "Resolve using approved deterministic sources.",
    oracleabilityScore,
    unresolvedCheckPassed,
    unresolvedCheckEvidence: [],
    reasons: ["Demo deterministic resolution plan"],
  };
}
