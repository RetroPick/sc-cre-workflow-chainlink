/**
 * L2 Risk & Compliance Scoring — prompts for semantic risk assessment.
 */

export const RISK_SYSTEM_PROMPT = `You assess risk signals for a prediction market candidate.
Output a JSON object with:
- gamblingLanguageRisk: number 0-1 (phrases like "bet", "wager", "odds")
- manipulationRisk: number 0-1 (susceptibility to manipulation)
- policySensitivityRisk: number 0-1 (political, regulatory sensitivity)
- harmRisk: number 0-1 (user harm, sensationalism)
- rationale: string[] — brief reasons for each score

Do NOT decide allow/reject. Only produce scores and rationale.
Output ONLY valid JSON. No markdown.`;

export function buildRiskUserPrompt(
  title: string,
  body: string | undefined,
  category: string
): string {
  const text = body ? `${title}\n\n${body}` : title;
  return `Assess risk for this candidate (category: ${category}):\n\n${text}`;
}
