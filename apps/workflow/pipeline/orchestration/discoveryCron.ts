/**
 * Discovery Cron — CRE Orchestration Layer.
 * Fetches observations from source registry, dedupes, optionally runs analysis core, and bridges to market creation.
 * When orchestration.enabled: uses analyzeCandidate + policy; only ALLOW items create markets.
 * Otherwise: Phase 1 bridge (all observations → createMarkets).
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { SourceObservation } from "../../domain/candidate";
import type { WorkflowConfig } from "../../types/config";
import type { FeedItem } from "../../types/feed";
import { fetchObservationsFromRegistry } from "../../sources/registry";
import { generateMarketInput } from "../../builders/generateMarket";
import { createMarkets } from "../creation/marketCreator";
import { analyzeCandidate } from "./analyzeCandidate";
import { saveResolutionPlan } from "../persistence/resolutionPlanStore";
import { writeDraftRecord } from "../creation/draftWriter";
import { getDefaultDraftRepository } from "../persistence/draftRepository";
import type { PolymarketDraftInput } from "../../sources/polymarketEvents";

/**
 * Deduplicates observations by externalId (keeps first occurrence).
 */
function dedupeObservations(observations: SourceObservation[]): SourceObservation[] {
  const seen = new Set<string>();
  return observations.filter((obs) => {
    if (seen.has(obs.externalId)) return false;
    seen.add(obs.externalId);
    return true;
  });
}

/**
 * Converts SourceObservation to FeedItem for bridge to existing market creation path.
 * Uses raw field: FeedItem for most sources, PolymarketDraftInput for polymarket.
 */
function observationToFeedItem(obs: SourceObservation): FeedItem | null {
  const raw = obs.raw;
  if (isFeedItem(raw)) {
    return raw;
  }
  if (isPolymarketDraft(raw)) {
    return {
      feedId: obs.sourceId,
      question: raw.question,
      category: raw.category ?? "Trending",
      resolveTime: raw.resolveTime,
      sourceUrl: "https://gamma-api.polymarket.com",
      externalId: raw.externalId,
    };
  }
  return null;
}

function isFeedItem(x: unknown): x is FeedItem {
  return (
    typeof x === "object" &&
    x !== null &&
    "feedId" in x &&
    "question" in x &&
    "category" in x &&
    "resolveTime" in x &&
    "externalId" in x
  );
}

function isPolymarketDraft(x: unknown): x is PolymarketDraftInput {
  return (
    typeof x === "object" &&
    x !== null &&
    "question" in x &&
    "resolveTime" in x &&
    "externalId" in x
  );
}

/**
 * Discovery cron handler.
 * Phase 1: fetch → dedupe → bridge to createMarkets.
 * Phase 2: uses analyzeCandidate, policy, and draft artifact when orchestration.enabled.
 */
export async function onDiscoveryCron(runtime: Runtime<WorkflowConfig>): Promise<string> {
  const feeds = runtime.config.feeds || [];
  if (feeds.length === 0) {
    runtime.log("[DiscoveryCron] No feeds configured.");
    return "No feeds";
  }

  const requestedBy = runtime.config.creatorAddress;
  if (!requestedBy) {
    runtime.log("[DiscoveryCron] Missing creatorAddress in config, skipping.");
    return "Missing creatorAddress";
  }

  const observations = fetchObservationsFromRegistry(runtime);
  if (observations.length === 0) {
    runtime.log("[DiscoveryCron] No observations from registry.");
    return "No observations";
  }

  const deduped = dedupeObservations(observations);
  runtime.log(`[DiscoveryCron] ${observations.length} observations, ${deduped.length} after dedupe`);

  const useOrchestration = runtime.config.orchestration?.enabled === true;
  const useDraftingPipeline = runtime.config.orchestration?.draftingPipeline === true;
  let items: FeedItem[] = [];

  if (useOrchestration) {
    const approved: FeedItem[] = [];
    const draftRepo = getDefaultDraftRepository();
    for (const obs of deduped) {
      const result = await analyzeCandidate(runtime, obs, { config: runtime.config });
      if ((result.policy.status === "ALLOW" || result.policy.status === "REVIEW") && result.draft) {
        saveResolutionPlan(result.resolutionPlan, {
          question: result.understanding.candidateQuestion,
          draftId: result.draft?.draftId,
        });
        if (useDraftingPipeline) {
          await writeDraftRecord({
            repo: draftRepo,
            observation: result.observation,
            understanding: result.understanding,
            risk: result.risk,
            evidence: result.evidence,
            resolutionPlan: result.resolutionPlan,
            policy: result.policy,
            draft: result.draft,
            brochure: result.marketBrief,
            expiresAt: Math.floor(Date.now() / 1000) + 86400 * 7,
          });
        }
        if (!useDraftingPipeline && result.policy.status === "ALLOW") {
          const item = observationToFeedItem(obs);
          if (item) approved.push(item);
        }
      }
    }
    if (useDraftingPipeline) {
      runtime.log(`[DiscoveryCron] Orchestration + drafting pipeline: drafts persisted (no direct create)`);
      return "Drafts persisted";
    }
    items = approved;
    runtime.log(`[DiscoveryCron] Orchestration: ${approved.length} approved of ${deduped.length}`);
  } else {
    for (const obs of deduped) {
      const item = observationToFeedItem(obs);
      if (item) items.push(item);
    }
  }

  if (items.length === 0) {
    runtime.log("[DiscoveryCron] No valid feed items after conversion.");
    return useOrchestration ? "No approved" : "No items";
  }

  const inputs = items.map((item) => generateMarketInput(item, requestedBy));
  return createMarkets(runtime, inputs);
}
