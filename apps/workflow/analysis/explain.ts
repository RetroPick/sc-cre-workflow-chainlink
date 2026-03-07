/**
 * L5 Explainability layer — generates MarketBrief for approved drafts.
 * Plain-language explanation so users understand what they are trading on.
 */
import type { DraftArtifact } from "../domain/draft";
import type { EvidenceBundle } from "../domain/evidence";
import type { MarketBrief } from "../domain/marketBrief";
import type { LlmProvider } from "../models/interfaces";
import { EXPLAIN_SYSTEM_PROMPT, buildExplainUserPrompt } from "../models/prompts/explain.prompt";

export type ExplainOptions = {
  llm: LlmProvider;
};

/**
 * Generates a market brief from an approved draft and evidence.
 * Guardrails: cannot alter outcomes, resolution plan, or introduce uncited claims.
 */
export async function generateMarketBrief(
  draft: DraftArtifact,
  evidence: EvidenceBundle,
  options: ExplainOptions
): Promise<MarketBrief> {
  const evidenceLinks = evidence.primary.map((e) => e.url);
  const user = buildExplainUserPrompt(
    draft.canonicalQuestion,
    draft.outcomes,
    evidenceLinks,
    draft.resolutionPlan.resolutionPredicate
  );

  const raw = await options.llm.completeJson<{
    title?: string;
    explanation?: string;
    whyThisMarketExists?: string;
    evidenceSummary?: string[];
    sourceLinks?: string[];
    resolutionExplanation?: string;
    caveats?: string[];
  }>({
    system: EXPLAIN_SYSTEM_PROMPT,
    user,
    schemaName: "MarketBrief",
    temperature: 0.2,
  });

  return {
    title: raw.title?.trim() ?? draft.canonicalQuestion.slice(0, 80),
    explanation: raw.explanation?.trim() ?? draft.explanation,
    whyThisMarketExists: raw.whyThisMarketExists?.trim() ?? "",
    evidenceSummary: Array.isArray(raw.evidenceSummary) ? raw.evidenceSummary : [],
    sourceLinks: Array.isArray(raw.sourceLinks) ? raw.sourceLinks.filter((u) => typeof u === "string") : evidenceLinks,
    resolutionExplanation: raw.resolutionExplanation?.trim() ?? draft.resolutionPlan.resolutionPredicate,
    caveats: Array.isArray(raw.caveats) ? raw.caveats : [],
  };
}
