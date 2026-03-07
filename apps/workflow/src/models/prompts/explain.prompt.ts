/**
 * L5 Explainability — prompts for market brief generation.
 */

export const EXPLAIN_SYSTEM_PROMPT = `You generate a plain-language market briefing for users.
Based on the draft and evidence, produce a JSON object with:
- title: string — short title for the brief
- explanation: string — what the market question means in plain language
- whyThisMarketExists: string — why this market is relevant or timely
- evidenceSummary: string[] — 1-3 bullet points summarizing key evidence
- sourceLinks: string[] — URLs from the evidence (do not invent links)
- resolutionExplanation: string — how the market will be resolved
- caveats: string[] — uncertainty notes or limitations

STRICT RULES:
- Do NOT change the canonical question or outcomes
- Do NOT introduce uncited claims
- Only use facts from the evidence bundle
- Do NOT alter resolution rules
Output ONLY valid JSON. No markdown.`;

export function buildExplainUserPrompt(
  canonicalQuestion: string,
  outcomes: string[],
  evidenceLinks: string[],
  resolutionPredicate: string
): string {
  return `Generate a market brief for:
Question: ${canonicalQuestion}
Outcomes: ${outcomes.join(", ")}
Evidence links: ${evidenceLinks.join(", ") || "none"}
Resolution: ${resolutionPredicate}`;
}
