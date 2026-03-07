/**
 * Policy types for CRE Orchestration Layer.
 */
import type { SourceObservation } from "./candidate";
import type { UnderstandingOutput } from "./understanding";
import type { RiskScores } from "./risk";
import type { EvidenceBundle } from "./evidence";
import type { ResolutionPlan } from "./resolutionPlan";

export type PolicyDecisionScores = {
  ambiguity: number;
  overallRisk: number;
  gamblingLanguageRisk: number;
  oracleability: number;
};

export type PolicyDecision =
  | { status: "ALLOW"; reasons: string[]; policyVersion: string; ruleHits: string[]; scores: PolicyDecisionScores }
  | { status: "REVIEW"; reasons: string[]; policyVersion: string; ruleHits: string[]; scores: PolicyDecisionScores }
  | { status: "REJECT"; reasons: string[]; policyVersion: string; ruleHits: string[]; scores: PolicyDecisionScores };

export type PolicyInput = {
  observation: SourceObservation;
  understanding: UnderstandingOutput;
  risk: RiskScores;
  evidence: EvidenceBundle;
  resolutionPlan: ResolutionPlan;
};
