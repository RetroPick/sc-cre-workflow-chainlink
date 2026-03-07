/**
 * Source Registry for CRE Orchestration Layer.
 * Dispatches by feed type and returns normalized SourceObservation[].
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { SourceObservation } from "../domain/candidate";
import type { WorkflowConfig } from "../types/config";
import type { FeedConfig, FeedItem } from "../types/feed";
import { validateFeedConfig } from "../builders/schemaValidator";
import { fetchCoinGeckoFeed } from "./coinGecko";
import { fetchNewsApiFeed } from "./newsAPI";
import { fetchGithubTrends } from "./githubTrends";
import { fetchPolymarketEvents } from "./polymarketEvents";
import { fetchPolymarketMarkets } from "./polymarketMarkets";
import { fetchCustomFeed } from "./customFeeds";
import type { PolymarketDraftInput } from "./polymarketEvents";

/**
 * Maps FeedItem to SourceObservation (canonical schema for orchestration layer).
 */
export function feedItemToSourceObservation(
  item: FeedItem,
  feed: FeedConfig
): SourceObservation {
  const now = Math.floor(Date.now() / 1000);
  return {
    sourceType: feed.type,
    sourceId: feed.id,
    externalId: item.externalId,
    observedAt: now,
    title: item.question,
    body: item.metadata ? JSON.stringify(item.metadata) : undefined,
    url: item.sourceUrl,
    tags: item.category ? [item.category] : undefined,
    eventTime: item.resolveTime,
    raw: item,
  };
}

/**
 * Maps PolymarketDraftInput to SourceObservation.
 */
export function polymarketDraftToSourceObservation(
  draft: PolymarketDraftInput,
  feed: FeedConfig
): SourceObservation {
  const now = Math.floor(Date.now() / 1000);
  return {
    sourceType: "polymarket",
    sourceId: feed.id,
    externalId: draft.externalId,
    observedAt: now,
    title: draft.question,
    body: draft.questionUri,
    url: "https://gamma-api.polymarket.com",
    tags: draft.category ? [draft.category] : undefined,
    entityHints: draft.outcomes,
    eventTime: draft.resolveTime,
    raw: draft,
  };
}

/**
 * Fetches observations from a single feed and returns SourceObservation[].
 */
function fetchObservationsFromFeed(
  runtime: Runtime<WorkflowConfig>,
  feed: FeedConfig
): SourceObservation[] {
  switch (feed.type) {
    case "coinGecko": {
      const items = fetchCoinGeckoFeed(runtime, feed);
      return items.map((item) => feedItemToSourceObservation(item, feed));
    }
    case "newsAPI": {
      const items = fetchNewsApiFeed(runtime, feed);
      return items.map((item) => feedItemToSourceObservation(item, feed));
    }
    case "githubTrends": {
      const items = fetchGithubTrends(runtime, feed);
      return items.map((item) => feedItemToSourceObservation(item, feed));
    }
    case "polymarket": {
      const drafts = fetchPolymarketEvents(runtime, feed);
      return drafts.map((d) => polymarketDraftToSourceObservation(d, feed));
    }
    case "polymarketMarkets": {
      const drafts = fetchPolymarketMarkets(runtime, feed);
      return drafts.map((d) => polymarketDraftToSourceObservation(d, feed));
    }
    case "custom": {
      const items = fetchCustomFeed(runtime, feed);
      return items.map((item) => feedItemToSourceObservation(item, feed));
    }
    default:
      return [];
  }
}

/**
 * Fetches observations from all configured feeds.
 * Runs each feed fetch; failures are logged and skipped.
 */
export function fetchObservationsFromRegistry(
  runtime: Runtime<WorkflowConfig>
): SourceObservation[] {
  const feeds = runtime.config.feeds || [];
  const observations: SourceObservation[] = [];

  for (const feed of feeds) {
    try {
      validateFeedConfig(feed);
      const obs = fetchObservationsFromFeed(runtime, feed);
      observations.push(...obs);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      runtime.log(`[Registry] Feed ${feed.id} (${feed.type}) skipped: ${msg}`);
    }
  }

  return observations;
}
