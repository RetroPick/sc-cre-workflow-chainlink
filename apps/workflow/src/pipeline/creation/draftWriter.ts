/**
 * Draft persistence and lifecycle — Market Drafting Pipeline (04).
 * Persists full DraftRecord, manages status transitions (PENDING_CLAIM → CLAIMED → PUBLISHED).
 */
import type { DraftArtifact } from "../../domain/draft";
import type { MarketBrief } from "../../domain/marketBrief";
import type { PolicyDecision } from "../../domain/policy";
import type { EvidenceBundle } from "../../domain/evidence";
import type { DraftRecord, DraftStatus } from "../../domain/draftRecord";
import type { SourceObservation } from "../../domain/candidate";
import type { UnderstandingOutput } from "../../domain/understanding";
import type { RiskScores } from "../../domain/risk";
import type { ResolutionPlan } from "../../domain/resolutionPlan";

export interface DraftRepository {
  put(record: DraftRecord): Promise<void>;
  get(draftId: string): Promise<DraftRecord | null>;
  updateStatus(args: {
    draftId: string;
    status: DraftStatus;
    claimedAt?: number;
    publishedAt?: number;
    creator?: string;
    claimer?: string;
    marketId?: string;
    onchainDraftRef?: string;
  }): Promise<void>;
}

export interface DraftBoardRegistrar {
  registerDraft?(record: DraftRecord): Promise<{ onchainDraftRef: string }>;
}

/** Build minimal brochure when LLM explainability not used. */
function buildFallbackBrochure(draft: DraftArtifact, evidence: EvidenceBundle): MarketBrief {
  const sourceLinks = [...evidence.primary.map((e) => e.url), ...evidence.supporting.map((e) => e.url)].slice(0, 6);
  return {
    title: draft.canonicalQuestion.slice(0, 80),
    explanation: draft.explanation,
    whyThisMarketExists: "",
    evidenceSummary: evidence.primary.slice(0, 2).map((e) => e.label),
    sourceLinks,
    resolutionExplanation: draft.resolutionPlan.resolutionPredicate,
    caveats: draft.policyDecision === "REVIEW" ? ["This draft requires manual review before publication."] : [],
  };
}

function initialStatus(policy: PolicyDecision): DraftStatus {
  switch (policy.status) {
    case "ALLOW":
      return "PENDING_CLAIM";
    case "REVIEW":
      return "REVIEW_REQUIRED";
    case "REJECT":
    default:
      return "REJECTED";
  }
}

export type WriteDraftRecordInput = {
  repo: DraftRepository;
  registrar?: DraftBoardRegistrar;
  observation: SourceObservation;
  understanding: UnderstandingOutput;
  risk: RiskScores;
  evidence: EvidenceBundle;
  resolutionPlan: ResolutionPlan;
  policy: PolicyDecision;
  draft: DraftArtifact;
  brochure?: MarketBrief;
  expiresAt?: number;
};

/**
 * Persist draft record. Only call when policy is ALLOW or REVIEW.
 * For REJECT, do not create claimable draft — audit only.
 */
export async function writeDraftRecord(args: WriteDraftRecordInput): Promise<DraftRecord> {
  const status = initialStatus(args.policy);

  if (status === "REJECTED") {
    throw new Error("writeDraftRecord should not be called for REJECT policy");
  }

  const brochure = args.brochure ?? buildFallbackBrochure(args.draft, args.evidence);

  const record: DraftRecord = {
    draftId: args.draft.draftId,
    status,
    observation: args.observation,
    understanding: args.understanding,
    risk: args.risk,
    evidence: args.evidence,
    resolutionPlan: args.resolutionPlan,
    policy: args.policy,
    draft: args.draft,
    brochure,
    createdAt: args.draft.createdAt,
    expiresAt: args.expiresAt,
  };

  if (status === "PENDING_CLAIM" && args.registrar?.registerDraft) {
    const registered = await args.registrar.registerDraft(record);
    record.onchainDraftRef = registered.onchainDraftRef;
  }

  await args.repo.put(record);
  return record;
}

export async function markDraftClaimed(args: {
  repo: DraftRepository;
  draftId: string;
  creator?: string;
  claimer?: string;
}): Promise<void> {
  await args.repo.updateStatus({
    draftId: args.draftId,
    status: "CLAIMED",
    claimedAt: Math.floor(Date.now() / 1000),
    creator: args.creator,
    claimer: args.claimer,
  });
}

export async function markDraftPublished(args: {
  repo: DraftRepository;
  draftId: string;
  marketId?: string;
}): Promise<void> {
  await args.repo.updateStatus({
    draftId: args.draftId,
    status: "PUBLISHED",
    publishedAt: Math.floor(Date.now() / 1000),
    marketId: args.marketId,
  });
}

export async function expireDraft(args: { repo: DraftRepository; draftId: string }): Promise<void> {
  await args.repo.updateStatus({
    draftId: args.draftId,
    status: "EXPIRED",
  });
}
