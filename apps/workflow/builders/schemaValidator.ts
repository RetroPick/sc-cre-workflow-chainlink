import type { FeedConfig, FeedItem, MarketInput } from "../types/feed";

const MIN_QUESTION_LEN = 10;
const MAX_QUESTION_LEN = 200;

export function validateFeedConfig(feed: FeedConfig): void {
  if (!feed.id || !feed.type) {
    throw new Error("Feed config missing id or type");
  }
  if (!feed.mock && !feed.url && feed.type !== "coinGecko") {
    throw new Error(`Feed ${feed.id} missing url`);
  }
}

export function validateFeedItem(item: FeedItem): void {
  if (!item.question || item.question.length < MIN_QUESTION_LEN) {
    throw new Error(`Invalid question length for feed ${item.feedId}`);
  }
  if (item.question.length > MAX_QUESTION_LEN) {
    throw new Error(`Question too long for feed ${item.feedId}`);
  }
  if (!item.category) {
    throw new Error(`Missing category for feed ${item.feedId}`);
  }
  if (!item.resolveTime || item.resolveTime <= 0) {
    throw new Error(`Invalid resolve time for feed ${item.feedId}`);
  }
}

export function validateMarketInput(input: MarketInput): void {
  if (!input.requestedBy || input.requestedBy === "0x0000000000000000000000000000000000000000") {
    throw new Error("Missing requestedBy address");
  }
  if (!input.externalId || input.externalId === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    throw new Error("Missing externalId");
  }
  if (!input.category) {
    throw new Error("Missing category");
  }
  if (!input.source) {
    throw new Error("Missing source");
  }
  validateFeedItem({
    feedId: "market-input",
    question: input.question,
    category: input.category,
    resolveTime: input.resolveTime,
    sourceUrl: input.source,
    externalId: input.externalId,
  });
}
