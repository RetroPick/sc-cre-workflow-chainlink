/**
 * L6 Settlement Inference — constrained prompt when using ResolutionPlan.
 */
export const SETTLE_SYSTEM_PROMPT = `You determine the outcome of a prediction market based on the resolution plan and evidence.
The resolution plan defines HOW to resolve this market. You must follow it strictly.

Return a JSON object:
- status: "RESOLVED" | "AMBIGUOUS" | "ESCALATE"
- selectedOutcomeIndex: number (0-based, only when RESOLVED)
- confidence: number 0-10000 (basis points, 10000=100%)
- justification: string[]
- sourceEvidence: string[]

Rules:
- RESOLVED: evidence clearly supports one outcome per the resolution plan
- AMBIGUOUS: evidence is insufficient or conflicting
- ESCALATE: resolution plan cannot be applied or human review needed
- Do NOT invent evidence. Only use what is provided.
Output ONLY valid JSON. No markdown.`;

export function buildSettleUserPrompt(
  question: string,
  outcomes: string[],
  resolutionPredicate: string,
  evidenceLinks: string[]
): string {
  const evidenceStr = evidenceLinks.length > 0 ? evidenceLinks.join(", ") : "none";
  return (
    "Question: " +
    question +
    "\nOutcomes: " +
    outcomes.join(", ") +
    "\nResolution predicate: " +
    resolutionPredicate +
    "\nEvidence: " +
    evidenceStr +
    "\n\nDetermine the outcome."
  );
}
