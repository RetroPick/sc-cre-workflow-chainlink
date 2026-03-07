/**
 * Demo mock settlement resolver — fixture-based per DEMO.md §7.5.
 * No LLM; deterministic mapping from question pattern or fixture to outcome.
 */
import type { ResolutionPlan } from "../../src/domain/resolutionPlan";

export type MockSettlementResult = {
  outcomeIndex: number;
  confidenceBps: number;
  reasoning: string;
};

/** Fixture: question pattern → outcome (0=Yes, 1=No) */
const QUESTION_PATTERNS: Array<{ pattern: RegExp; outcome: number }> = [
  { pattern: /eth exceed \$6000|eth.*6000/i, outcome: 0 },
  { pattern: /metamask token|metamask.*launch/i, outcome: 1 },
  { pattern: /btc.*100000|bitcoin.*100k/i, outcome: 0 },
  { pattern: /official.*announcement.*true/i, outcome: 0 },
  { pattern: /official.*announcement.*false|no official/i, outcome: 1 },
];

/** Default when no pattern matches */
const DEFAULT_OUTCOME = 0;
const DEFAULT_CONFIDENCE_BPS = 9200;

export function mockResolveSettlement(
  question: string,
  _marketId: string,
  _resolutionPlan?: ResolutionPlan | null
): MockSettlementResult {
  for (const { pattern, outcome } of QUESTION_PATTERNS) {
    if (pattern.test(question)) {
      return {
        outcomeIndex: outcome,
        confidenceBps: 9200,
        reasoning: "Fixture-based deterministic resolution",
      };
    }
  }

  return {
    outcomeIndex: DEFAULT_OUTCOME,
    confidenceBps: DEFAULT_CONFIDENCE_BPS,
    reasoning: "Fixture-based deterministic resolution (default)",
  };
}
