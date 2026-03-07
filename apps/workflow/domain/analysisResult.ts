/**
 * Analysis result type for CRE Orchestration Layer.
 */
import type { SourceObservation } from "./candidate";
import type { UnderstandingOutput } from "./understanding";
import type { RiskScores } from "./risk";
import type { EvidenceBundle } from "./evidence";
import type { ResolutionPlan } from "./resolutionPlan";
import type { PolicyDecision } from "./policy";
import type { DraftArtifact } from "./draft";
import type { MarketBrief } from "./marketBrief";

export type AnalysisResult = {
  observation: SourceObservation;
  understanding: UnderstandingOutput;
  risk: RiskScores;
  evidence: EvidenceBundle;
  resolutionPlan: ResolutionPlan;
  policy: PolicyDecision;
  draft?: DraftArtifact;
  marketBrief?: MarketBrief;
};
