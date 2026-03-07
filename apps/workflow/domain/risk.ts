/**
 * Risk scoring types for CRE Orchestration Layer.
 */
export type RiskScores = {
  categoryRisk: number;
  gamblingLanguageRisk: number;
  manipulationRisk: number;
  ambiguityRisk: number;
  policySensitivityRisk: number;
  duplicateRisk: number;
  harmRisk: number;
  overallRisk: number;
  flaggedTerms: string[];
  rationale: string[];
};
