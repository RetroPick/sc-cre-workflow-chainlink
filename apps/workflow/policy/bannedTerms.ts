/**
 * Hard-banned dangerous language (violence, harm).
 * Per 03_SafetyComplienceLayer.md.
 */
export const HARD_BANNED_TERMS: string[] = [
  "assassination",
  "kill",
  "murder",
  "terrorist attack",
  "terror attack",
  "school shooting",
];

/**
 * Gambling-like terms (betting, wagers, odds).
 * Per 03_SafetyComplienceLayer.md.
 */
export const GAMBLING_TERMS: string[] = [
  "bet",
  "wager",
  "odds",
  "gamble",
  "gambling",
  "stake",
  "stakes",
  "sportsbook",
  "parlay",
  "spread",
];

/** @deprecated Use HARD_BANNED_TERMS and GAMBLING_TERMS. Kept for backward compat. */
export const BANNED_TERMS: string[] = [...HARD_BANNED_TERMS, ...GAMBLING_TERMS];
