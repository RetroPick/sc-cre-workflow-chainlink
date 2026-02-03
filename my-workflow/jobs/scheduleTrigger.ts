import type { Runtime } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../types/config";
import type { FeedConfig, FeedItem } from "../types/feed";
import { fetchCoinGeckoFeed } from "../sources/coinGecko";
import { fetchNewsApiFeed } from "../sources/newsAPI";
import { fetchGithubTrends } from "../sources/githubTrends";
import { fetchCustomFeed } from "../sources/customFeeds";
import { validateFeedConfig } from "../builders/schemaValidator";
import { generateMarketInput } from "../builders/generateMarket";
import { createMarkets } from "./marketCreator";

export function onScheduleTrigger(runtime: Runtime<WorkflowConfig>): string {
  const feeds = runtime.config.feeds || [];
  if (feeds.length === 0) {
    runtime.log("[Cron] No feeds configured.");
    return "No feeds";
  }

  const requestedBy = runtime.config.creatorAddress;
  if (!requestedBy) {
    runtime.log("[Cron] Missing creatorAddress in config, skipping.");
    return "Missing creatorAddress";
  }

  const items: FeedItem[] = [];

  for (const feed of feeds) {
    try {
      validateFeedConfig(feed);
      items.push(...fetchFeed(runtime, feed));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      runtime.log(`[Cron] Feed ${feed.id} skipped: ${msg}`);
    }
  }

  if (items.length === 0) {
    runtime.log("[Cron] No feed items generated.");
    return "No items";
  }

  const inputs = items.map((item) => generateMarketInput(item, requestedBy));
  const result = createMarkets(runtime, inputs);

  return result;
}

function fetchFeed(runtime: Runtime<WorkflowConfig>, feed: FeedConfig): FeedItem[] {
  switch (feed.type) {
    case "coinGecko":
      return fetchCoinGeckoFeed(runtime, feed);
    case "newsAPI":
      return fetchNewsApiFeed(runtime, feed);
    case "githubTrends":
      return fetchGithubTrends(runtime, feed);
    case "custom":
      return fetchCustomFeed(runtime, feed);
    default:
      return [];
  }
}
