/**
 * Draft artifact synthesis — builds DraftArtifact from approved analysis.
 * Uses LLM for canonical question, outcomes, explanation when useLlm and llm provided.
 */
import { keccak256, toHex } from "viem";
import type { SourceObservation } from "../domain/candidate";
import type { UnderstandingOutput } from "../domain/understanding";
import type { RiskScores } from "../domain/risk";
import type { EvidenceBundle } from "../domain/evidence";
import type { ResolutionPlan } from "../domain/resolutionPlan";
import type { PolicyDecision } from "../domain/policy";
import type { DraftArtifact } from "../domain/draft";
import type { PrivacyProfile } from "../domain/privacy";
import type { LlmProvider } from "../models/interfaces";
import { DRAFT_SYNTHESIS_SYSTEM_PROMPT, buildDraftUserPrompt } from "../models/prompts/draft.prompt";

export type SynthesizeDraftInput = {
  observation: SourceObservation;
  understanding: UnderstandingOutput;
  risk: RiskScores;
  evidence: EvidenceBundle;
  resolutionPlan: ResolutionPlan;
  policy: PolicyDecision;
  llm?: LlmProvider;
  useLlm?: boolean;
  /** Privacy profile for the draft. Stored on draft when set. */
  privacyProfile?: PrivacyProfile;
};

export async function synthesizeDraft(input: SynthesizeDraftInput): Promise<DraftArtifact> {
  const { observation, understanding, resolutionPlan, policy } = input;
  const hashInput = `${observation.externalId}:${observation.observedAt}:${understanding.candidateQuestion}`;
  const draftId = keccak256(toHex(hashInput));

  let canonicalQuestion = understanding.candidateQuestion;
  let outcomes =
    understanding.outcomes && understanding.outcomes.length >= 2
      ? understanding.outcomes
      : ["Yes", "No"];
  let explanation = `Market from ${observation.sourceType}: ${observation.title}`;

  if (input.llm && input.useLlm) {
    const generated = await input.llm.completeJson<{
      canonicalQuestion?: string;
      outcomes?: string[];
      explanation?: string;
    }>({
      system: DRAFT_SYNTHESIS_SYSTEM_PROMPT,
      user: buildDraftUserPrompt(
        understanding.candidateQuestion,
        understanding.category,
        understanding.marketType
      ),
      schemaName: "DraftSynthesisOutput",
      temperature: 0,
    });
    if (generated.canonicalQuestion && generated.canonicalQuestion.trim()) {
      canonicalQuestion = generated.canonicalQuestion.trim();
    }
    if (Array.isArray(generated.outcomes) && generated.outcomes.length >= 2) {
      outcomes = generated.outcomes;
    }
    if (generated.explanation && generated.explanation.trim()) {
      explanation = generated.explanation.trim();
    }
  }

  const evidenceLinks = input.evidence.primary.map((e) => e.url);

  return {
    draftId,
    canonicalQuestion,
    marketType: understanding.marketType === "invalid" ? "binary" : understanding.marketType,
    outcomes,
    category: understanding.category,
    explanation,
    evidenceLinks,
    policyVersion: policy.policyVersion,
    policyDecision: policy.status,
    policyReasons: policy.reasons,
    resolutionPlan,
    confidence: {
      topic: understanding.marketabilityScore,
      risk: 1 - input.risk.overallRisk,
      oracleability: resolutionPlan.oracleabilityScore,
      explanation: 0.8,
    },
    createdAt: Math.floor(Date.now() / 1000),
    privacyProfile: input.privacyProfile,
  };
}
