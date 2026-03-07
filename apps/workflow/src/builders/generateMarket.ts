import { keccak256, toHex } from "viem";
import type { FeedItem, MarketInput } from "../types/feed";
import { validateFeedItem } from "./schemaValidator";

export function generateMarketInput(
  item: FeedItem,
  requestedBy: `0x${string}`
): MarketInput {
  validateFeedItem(item);

  const hashInput = `${item.feedId}:${item.externalId}:${item.resolveTime}`;
  const externalId = keccak256(toHex(hashInput));

  return {
    question: item.question,
    requestedBy,
    resolveTime: item.resolveTime,
    category: item.category,
    source: item.sourceUrl || "unknown",
    externalId,
  };
}
