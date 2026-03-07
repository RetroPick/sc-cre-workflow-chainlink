/**
 * Policy thresholds for CRE Orchestration Layer.
 * Per 03_SafetyComplienceLayer.md §10.
 */
export const POLICY_VERSION = "v1.0.0";

export const POLICY_THRESHOLDS = {
  maxAmbiguityAllow: 0.45,
  maxAmbiguityReject: 0.75,
  maxAmbiguityReview: 0.75,

  maxOverallRiskAllow: 0.35,
  maxOverallRiskReview: 0.55,

  maxGamblingLanguageAllow: 0.35,
  maxGamblingLanguageReject: 0.8,

  minOracleabilityAllow: 0.8,
  minOracleabilityReview: 0.65,

  maxDuplicateRiskAllow: 0.5,
  maxDuplicateRiskReject: 0.85,

  /** @deprecated Use maxGamblingLanguageReject */
  maxGamblingLanguage: 0.8,
} as const;
