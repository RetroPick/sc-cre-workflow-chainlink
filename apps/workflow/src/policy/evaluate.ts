/**
 * Deterministic policy engine for CRE Orchestration Layer.
 * AI assists, policy decides — final source of truth is code.
 * Per 03_SafetyComplienceLayer.md §10 rulebook.
 */
import type { PolicyDecision, PolicyInput } from "../domain/policy";
import { BANNED_CATEGORIES, REVIEW_ONLY_CATEGORIES } from "./bannedCategories";
import { HARD_BANNED_TERMS, GAMBLING_TERMS } from "./bannedTerms";
import { POLICY_THRESHOLDS, POLICY_VERSION } from "./thresholds";

function mkDecision(
  status: PolicyDecision["status"],
  reasons: string[],
  ruleHits: string[],
  scores: PolicyDecision["scores"]
): PolicyDecision {
  return {
    status,
    reasons,
    ruleHits,
    policyVersion: POLICY_VERSION,
    scores,
  };
}

function containsHardBannedTerms(flaggedTerms: string[]): boolean {
  const lower = flaggedTerms.map((t) => t.toLowerCase());
  return HARD_BANNED_TERMS.some((term) =>
    lower.includes(term.toLowerCase())
  );
}

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const { observation, understanding, risk, resolutionPlan } = input;

  const reasons: string[] = [];
  const ruleHits: string[] = [];

  const scores = {
    ambiguity: understanding.ambiguityScore,
    overallRisk: risk.overallRisk,
    gamblingLanguageRisk: risk.gamblingLanguageRisk,
    oracleability: resolutionPlan.oracleabilityScore,
  };

  // 1. Hard category bans
  if (BANNED_CATEGORIES.includes(understanding.category)) {
    reasons.push(`Banned category: ${understanding.category}`);
    ruleHits.push("CATEGORY_BANNED");
    return mkDecision("REJECT", reasons, ruleHits, scores);
  }

  // 2. Hard banned terms
  if (containsHardBannedTerms(risk.flaggedTerms ?? [])) {
    reasons.push("Hard-banned dangerous language detected");
    ruleHits.push("HARD_BANNED_TERMS");
    return mkDecision("REJECT", reasons, ruleHits, scores);
  }

  // 3. Invalid market type
  if (understanding.marketType === "invalid") {
    reasons.push("Candidate market type is invalid");
    ruleHits.push("INVALID_MARKET_TYPE");
    return mkDecision("REJECT", reasons, ruleHits, scores);
  }

  // 4. Gambling language hard reject
  if (
    risk.gamblingLanguageRisk >= POLICY_THRESHOLDS.maxGamblingLanguageReject
  ) {
    reasons.push("Gambling-language risk exceeds hard reject threshold");
    ruleHits.push("GAMBLING_LANGUAGE_REJECT");
    return mkDecision("REJECT", reasons, ruleHits, scores);
  }

  // 5. Already resolved / known
  if (!resolutionPlan.unresolvedCheckPassed) {
    reasons.push("Outcome appears already known or announced");
    ruleHits.push("UNRESOLVED_CHECK_FAILED");
    return mkDecision("REJECT", reasons, ruleHits, scores);
  }

  // 6. Oracleability hard reject
  if (
    resolutionPlan.oracleabilityScore <
    POLICY_THRESHOLDS.minOracleabilityReview
  ) {
    reasons.push("Oracleability too weak for approval or review");
    ruleHits.push("ORACLEABILITY_TOO_LOW");
    return mkDecision("REJECT", reasons, ruleHits, scores);
  }

  // 7. Ambiguity hard reject
  if (understanding.ambiguityScore >= POLICY_THRESHOLDS.maxAmbiguityReject) {
    reasons.push("Ambiguity exceeds hard reject threshold");
    ruleHits.push("AMBIGUITY_REJECT");
    return mkDecision("REJECT", reasons, ruleHits, scores);
  }

  // 8. Duplicate hard reject
  if (risk.duplicateRisk >= POLICY_THRESHOLDS.maxDuplicateRiskReject) {
    reasons.push("Duplicate/conflict risk exceeds hard reject threshold");
    ruleHits.push("DUPLICATE_REJECT");
    return mkDecision("REJECT", reasons, ruleHits, scores);
  }

  // 9. Review-only categories
  if (REVIEW_ONLY_CATEGORIES.includes(understanding.category)) {
    reasons.push(`Category requires manual review: ${understanding.category}`);
    ruleHits.push("CATEGORY_REVIEW_ONLY");
    return mkDecision("REVIEW", reasons, ruleHits, scores);
  }

  // 10. Review band checks
  const reviewTriggers: string[] = [];

  if (
    risk.gamblingLanguageRisk > POLICY_THRESHOLDS.maxGamblingLanguageAllow
  ) {
    reviewTriggers.push("Medium gambling-language risk");
    ruleHits.push("GAMBLING_LANGUAGE_REVIEW");
  }

  if (understanding.ambiguityScore > POLICY_THRESHOLDS.maxAmbiguityAllow) {
    reviewTriggers.push("Medium ambiguity");
    ruleHits.push("AMBIGUITY_REVIEW");
  }

  if (
    resolutionPlan.oracleabilityScore <
    POLICY_THRESHOLDS.minOracleabilityAllow
  ) {
    reviewTriggers.push("Oracleability requires manual review");
    ruleHits.push("ORACLEABILITY_REVIEW");
  }

  if (risk.overallRisk > POLICY_THRESHOLDS.maxOverallRiskAllow) {
    reviewTriggers.push("Overall risk above auto-allow threshold");
    ruleHits.push("OVERALL_RISK_REVIEW");
  }

  if (risk.duplicateRisk > POLICY_THRESHOLDS.maxDuplicateRiskAllow) {
    reviewTriggers.push("Potential duplicate/conflict risk");
    ruleHits.push("DUPLICATE_REVIEW");
  }

  if (reviewTriggers.length > 0) {
    reasons.push(...reviewTriggers);
    return mkDecision("REVIEW", reasons, ruleHits, scores);
  }

  // 11. Auto-allow
  reasons.push(
    "Candidate passed category, language, ambiguity, oracleability, and unresolved-state checks"
  );
  ruleHits.push("AUTO_ALLOW");
  return mkDecision("ALLOW", reasons, ruleHits, scores);
}
