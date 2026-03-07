/**
 * Draft record types for Market Drafting Pipeline (04_MarketDraftingPipeline.md).
 * Full lifecycle record for draft artifacts from analysis through claim and publish.
 */
import type { SourceObservation } from "./candidate";
import type { UnderstandingOutput } from "./understanding";
import type { RiskScores } from "./risk";
import type { EvidenceBundle } from "./evidence";
import type { ResolutionPlan } from "./resolutionPlan";
import type { PolicyDecision } from "./policy";
import type { DraftArtifact } from "./draft";
import type { MarketBrief } from "./marketBrief";

export type DraftStatus =
  | "PENDING_CLAIM"
  | "CLAIMED"
  | "PUBLISHED"
  | "EXPIRED"
  | "REJECTED"
  | "REVIEW_REQUIRED";

export type DraftRecord = {
  draftId: string;
  status: DraftStatus;

  observation: SourceObservation;
  understanding: UnderstandingOutput;
  risk: RiskScores;
  evidence: EvidenceBundle;
  resolutionPlan: ResolutionPlan;
  policy: PolicyDecision;

  draft: DraftArtifact;
  brochure: MarketBrief;

  createdAt: number;
  claimedAt?: number;
  publishedAt?: number;
  expiresAt?: number;

  creator?: string;
  claimer?: string;
  marketId?: string;
  onchainDraftRef?: string;
};
