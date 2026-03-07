/**
 * L4 Draft Synthesis — prompts for canonical question and outcomes.
 */

export const DRAFT_SYNTHESIS_SYSTEM_PROMPT = `You convert a market candidate into a precise draft.
Output a JSON object with:
- canonicalQuestion: string — unambiguous question (e.g. "Will Consensys officially announce a MetaMask token on or before December 31, 2026?")
- outcomes: string[] — mutually exclusive options (e.g. ["Yes", "No"] for binary)
- explanation: string — 1-2 sentence summary of what the market is about

Rules:
- Use precise language, avoid hype
- Outcomes must be mutually exclusive and exhaustive
- No speculative or uncited claims in explanation
Output ONLY valid JSON. No markdown.`;

export function buildDraftUserPrompt(
  candidateQuestion: string,
  category: string,
  marketType: string
): string {
  return `Convert to draft:\nQuestion: ${candidateQuestion}\nCategory: ${category}\nMarket type: ${marketType}`;
}
