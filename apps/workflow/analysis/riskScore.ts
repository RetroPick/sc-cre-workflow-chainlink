/**
 * Risk scoring layer for policy evaluation.
 * Uses LLM for semantic risk when useLlm and llm provided; combines with lexical scores.
 */
import type { SourceObservation } from "../domain/candidate";
import type { UnderstandingOutput } from "../domain/understanding";
import type { RiskScores } from "../domain/risk";
import type { LlmProvider } from "../models/interfaces";
import { GAMBLING_TERMS, HARD_BANNED_TERMS } from "../policy/bannedTerms";
import { BANNED_CATEGORIES } from "../policy/bannedCategories";
import { RISK_SYSTEM_PROMPT, buildRiskUserPrompt } from "../models/prompts/risk.prompt";

export type RiskScoreOptions = {
  llm?: LlmProvider;
  useLlm?: boolean;
};

export async function scoreRisk(
  obs: SourceObservation,
  understanding: UnderstandingOutput,
  options?: RiskScoreOptions
): Promise<RiskScores> {
  const text = `${obs.title} ${obs.body ?? ""}`.toLowerCase();
  const flaggedTerms: string[] = [];
  let gamblingLanguageRisk = 0;

  const allTerms = [...GAMBLING_TERMS, ...HARD_BANNED_TERMS];
  for (const term of allTerms) {
    if (text.includes(term.toLowerCase())) {
      flaggedTerms.push(term);
      if (GAMBLING_TERMS.includes(term)) {
        gamblingLanguageRisk += 0.25;
      }
    }
  }
  gamblingLanguageRisk = Math.min(gamblingLanguageRisk, 1);

  const categoryRisk = BANNED_CATEGORIES.includes(understanding.category) ? 1 : 0.2;
  const ambiguityRisk = understanding.ambiguityScore;

  let manipulationRisk = 0.2;
  let policySensitivityRisk = categoryRisk;
  let harmRisk = 0.1;
  let rationale: string[] = [];

  if (options?.llm && options?.useLlm) {
    const semantic = await options.llm.completeJson<{
      gamblingLanguageRisk?: number;
      manipulationRisk?: number;
      policySensitivityRisk?: number;
      harmRisk?: number;
      rationale?: string[];
    }>({
      system: RISK_SYSTEM_PROMPT,
      user: buildRiskUserPrompt(obs.title, obs.body, understanding.category),
      schemaName: "RiskSemanticScores",
      temperature: 0,
    });
    if (typeof semantic.manipulationRisk === "number") manipulationRisk = Math.min(1, Math.max(0, semantic.manipulationRisk));
    if (typeof semantic.policySensitivityRisk === "number") policySensitivityRisk = Math.min(1, Math.max(0, semantic.policySensitivityRisk));
    if (typeof semantic.harmRisk === "number") harmRisk = Math.min(1, Math.max(0, semantic.harmRisk));
    if (Array.isArray(semantic.rationale)) rationale = semantic.rationale;
    if (typeof semantic.gamblingLanguageRisk === "number") {
      gamblingLanguageRisk = Math.max(gamblingLanguageRisk, Math.min(1, semantic.gamblingLanguageRisk));
    }
  }

  const overallRisk = (
    categoryRisk * 0.25 +
    gamblingLanguageRisk * 0.25 +
    ambiguityRisk * 0.25 +
    manipulationRisk * 0.1 +
    policySensitivityRisk * 0.1 +
    harmRisk * 0.05
  );

  return {
    categoryRisk,
    gamblingLanguageRisk,
    manipulationRisk,
    ambiguityRisk,
    policySensitivityRisk,
    duplicateRisk: understanding.duplicateClusterId ? 0.55 : 0.1,
    harmRisk,
    overallRisk: Math.min(overallRisk, 1),
    flaggedTerms,
    rationale,
  };
}
