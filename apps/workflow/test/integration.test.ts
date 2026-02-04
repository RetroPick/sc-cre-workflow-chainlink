import { generateMarketInput } from "../builders/generateMarket";
import { validateFeedItem, validateMarketInput } from "../builders/schemaValidator";
import type { FeedItem } from "../types/feed";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runIntegrationTest() {
  const feedItem: FeedItem = {
    feedId: "demo",
    question: "Will BTC be above 50000 USD tomorrow?",
    category: "crypto",
    resolveTime: Math.floor(Date.now() / 1000) + 3600,
    sourceUrl: "mock",
    externalId: "demo:btc",
  };

  validateFeedItem(feedItem);
  const marketInput = generateMarketInput(
    feedItem,
    "0xbeaA395506D02d20749d8E39ddb996ACe1C85Bfc"
  );
  validateMarketInput(marketInput);

  assert(marketInput.question.length > 0, "Question not set");
}
