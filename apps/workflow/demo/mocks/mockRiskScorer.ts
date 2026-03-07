/**
 * Demo mock risk scorer — heuristic-based per DEMO.md §7.2.
 * No LLM; politics/sports→0.95, rumor tag→0.55, threshold with date→0.2.
 */
import type { SourceObservation } from "../../src/domain/candidate";
import type { UnderstandingOutput } from "../../src/domain/understanding";
import type { RiskScores } from "../../src/domain/risk";

export function mockScoreRisk(
  obs: SourceObservation,
  understanding: UnderstandingOutput
): RiskScores {
  const text = `${obs.title} ${obs.body ?? ""}`.toLowerCase();
  const tags = (obs.tags ?? []).map((t) => t.toLowerCase());

  let overallRisk = 0.2;
  const flaggedTerms: string[] = [];

  // Politics / sports → high risk
  if (understanding.category === "politics" || understanding.category === "sports") {
    overallRisk = 0.95;
    flaggedTerms.push(understanding.category);
  }

  // Rumor tag → review band
  if (tags.includes("rumor")) {
    overallRisk = Math.max(overallRisk, 0.55);
    flaggedTerms.push("rumor");
  }

  // Vague wording
  if (/\b(soon|eventually|big launch|tbd)\b/.test(text)) {
    overallRisk = Math.max(overallRisk, 0.45);
    flaggedTerms.push("vague_wording");
  }

  // Clear threshold market with date → low risk
  if (
    (understanding.category === "crypto_asset" || understanding.category === "macro") &&
    /\d{4}|\$\d+/.test(text) &&
    overallRisk < 0.5
  ) {
    overallRisk = 0.2;
  }

  const categoryRisk = understanding.category === "politics" || understanding.category === "sports" ? 1 : 0.2;
  const gamblingLanguageRisk = /\b(bet|wager|odds)\b/.test(text) ? 0.8 : 0;
  const ambiguityRisk = understanding.ambiguityScore;
  const manipulationRisk = tags.includes("rumor") ? 0.55 : 0.2;
  const policySensitivityRisk = categoryRisk;
  const harmRisk = 0.1;
  const duplicateRisk = 0;

  return {
    categoryRisk,
    gamblingLanguageRisk,
    manipulationRisk,
    ambiguityRisk,
    policySensitivityRisk,
    duplicateRisk,
    harmRisk,
    overallRisk,
    flaggedTerms,
    rationale: overallRisk > 0.5 ? ["Demo heuristic risk assessment"] : [],
  };
}
