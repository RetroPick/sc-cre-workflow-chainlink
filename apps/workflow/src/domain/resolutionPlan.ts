/**
 * Resolution plan types for CRE Orchestration Layer.
 */
export type ResolutionSource = {
  sourceType:
    | "onchain_event"
    | "official_api"
    | "official_website"
    | "public_dataset"
    | "llm_consensus"
    | "manual_review";
  locator: string;
  trustScore: number;
  freshnessTtlSec?: number;
  notes?: string;
};

export type UnresolvedCheckResult = {
  passed: boolean;
  confidence: number;
  evidence: string[];
  matchedResolvedSignals: string[];
  matchedUnresolvedSignals: string[];
  requiresReview: boolean;
};

export type OracleabilityResult = {
  oracleabilityScore: number;
  resolutionMode:
    | "deterministic"
    | "multi_source_deterministic"
    | "ai_assisted"
    | "human_review";
  primarySources: ResolutionSource[];
  fallbackSources: ResolutionSource[];
  resolutionPredicate: string;
  reasons: string[];
};

export type ResolutionPlan = {
  resolutionMode:
    | "deterministic"
    | "multi_source_deterministic"
    | "ai_assisted"
    | "human_review";
  primarySources: ResolutionSource[];
  fallbackSources: ResolutionSource[];
  resolutionPredicate: string;
  oracleabilityScore: number;
  unresolvedCheckPassed: boolean;
  unresolvedCheckEvidence: string[];
  reasons?: string[];
};
