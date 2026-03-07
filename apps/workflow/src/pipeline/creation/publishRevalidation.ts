/**
 * Publish revalidation — Market Drafting Pipeline (04).
 * Revalidates draft before publish: freshness, params match, unresolved state.
 * Per 04_MarketDraftingPipeline.md §6.4.
 */
import type { DraftRecord } from "../../domain/draftRecord";
import type { DraftPublishParams } from "../../contracts/reportFormats";
import type { FeedItem } from "../../types/feed";

export type RevalidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export type PublishPayload = {
  draftId: string;
  creator: string;
  params: DraftPublishParams;
  claimerSig: string;
};

function getExpectedResolveTime(record: DraftRecord): number | undefined {
  const raw = record.observation.raw;
  if (raw && typeof raw === "object" && "resolveTime" in raw && typeof (raw as FeedItem).resolveTime === "number") {
    return (raw as FeedItem).resolveTime;
  }
  return record.observation.eventTime;
}

/**
 * Revalidate draft before publish.
 * Checks: draft exists, not expired, status claimable, params match stored draft.
 * EIP-712 signature validation is delegated to the contract.
 */
export function revalidateForPublish(
  record: DraftRecord,
  payload: PublishPayload
): RevalidationResult {
  if (record.draftId.toLowerCase() !== payload.draftId.toLowerCase()) {
    return { ok: false, reason: "draftId mismatch" };
  }

  if (record.status !== "PENDING_CLAIM" && record.status !== "CLAIMED") {
    return { ok: false, reason: `draft status is ${record.status}, not claimable` };
  }

  const now = Math.floor(Date.now() / 1000);
  if (record.expiresAt != null && record.expiresAt < now) {
    return { ok: false, reason: "draft expired" };
  }

  const { draft } = record;
  const { params } = payload;

  if (draft.canonicalQuestion.trim() !== params.question.trim()) {
    return { ok: false, reason: "question does not match stored draft" };
  }

  const marketTypeMap = { binary: 0, categorical: 1, timeline: 2 };
  const expectedMarketType = marketTypeMap[draft.marketType] ?? 0;
  if (params.marketType !== expectedMarketType) {
    return { ok: false, reason: "marketType does not match stored draft" };
  }

  if (
    draft.outcomes.length !== params.outcomes.length ||
    draft.outcomes.some((o, i) => o.trim() !== (params.outcomes[i] ?? "").trim())
  ) {
    return { ok: false, reason: "outcomes do not match stored draft" };
  }

  const expectedResolveTime = getExpectedResolveTime(record);
  if (expectedResolveTime != null && params.resolveTime !== expectedResolveTime) {
    return { ok: false, reason: "resolveTime does not match stored draft" };
  }

  if (!record.resolutionPlan.unresolvedCheckPassed) {
    return { ok: false, reason: "unresolved check did not pass at draft time" };
  }

  return { ok: true };
}
