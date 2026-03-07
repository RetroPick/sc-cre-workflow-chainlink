/**
 * Demo mock brochure — template-based per DEMO.md §7.4.
 * No LLM; deterministic paragraph from draft + evidence.
 */
import type { DraftArtifact } from "../../src/domain/draft";
import type { EvidenceBundle } from "../../src/domain/evidence";
import type { MarketBrief } from "../../src/domain/marketBrief";

export function mockBuildBrochure(
  draft: DraftArtifact,
  evidence: EvidenceBundle
): MarketBrief {
  const questionStem = draft.canonicalQuestion.replace(/\?$/, "");
  const explanation = `This market asks whether ${questionStem}.`;
  const evidenceSummary = evidence.primary.slice(0, 2).map((e) => e.label);
  const sourceLinks = [...draft.evidenceLinks];
  const resolutionExplanation =
    "This market resolves using approved deterministic sources in the stored resolution plan.";
  const caveats =
    draft.policyDecision === "REVIEW"
      ? ["This draft requires manual review before publication."]
      : [];

  return {
    title: draft.canonicalQuestion,
    explanation,
    whyThisMarketExists: `Market from ${draft.category} category.`,
    evidenceSummary,
    sourceLinks,
    resolutionExplanation,
    caveats,
  };
}
