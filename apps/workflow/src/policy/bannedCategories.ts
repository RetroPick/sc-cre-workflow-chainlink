import type { UnderstandingOutput } from "../domain/understanding";

/**
 * Banned categories for policy engine.
 * Per 03_SafetyComplienceLayer.md.
 */
export const BANNED_CATEGORIES: UnderstandingOutput["category"][] = [
  "politics",
  "sports",
  "war_violence",
];

/**
 * Categories that require manual review (not auto-allow).
 * Per 03_SafetyComplienceLayer.md.
 */
export const REVIEW_ONLY_CATEGORIES: UnderstandingOutput["category"][] = [
  "regulatory",
  "entertainment",
];
