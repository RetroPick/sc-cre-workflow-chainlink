/**
 * L1 Candidate Understanding — prompts for structured extraction.
 */
import type { UnderstandingOutput } from "../../../domain/understanding";

const CATEGORIES: UnderstandingOutput["category"][] = [
  "macro",
  "weather",
  "crypto_asset",
  "crypto_product",
  "governance",
  "company_milestone",
  "regulatory",
  "politics",
  "sports",
  "war_violence",
  "science",
  "entertainment",
  "unknown",
];

export const UNDERSTANDING_SYSTEM_PROMPT = `You analyze market candidate ideas for a prediction market platform.
Extract structured information from the given text. Output a single JSON object with these exact properties:
- canonicalSubject: string — the main subject (e.g. "MetaMask token launch")
- eventType: string — type of event (e.g. "product_launch", "price_threshold")
- category: one of ${JSON.stringify(CATEGORIES)}
- subcategory: string (optional)
- candidateQuestion: string — a clear yes/no or categorical question
- marketType: "binary" | "categorical" | "timeline" | "invalid"
- outcomes: string[] (optional, for categorical)
- entities: string[] — named entities (companies, tokens, people)
- ambiguityScore: number 0-1 (1 = very ambiguous)
- marketabilityScore: number 0-1 (1 = good market candidate)
- temporalWindow: { opensAt?: number, resolvesBy?: number } (optional, unix timestamps)

STRICT: Output ONLY valid JSON. No markdown, no explanation.`;

export function buildUnderstandingUserPrompt(title: string, body?: string): string {
  const text = body ? `${title}\n\n${body}` : title;
  return `Analyze this market candidate:\n\n${text}`;
}
