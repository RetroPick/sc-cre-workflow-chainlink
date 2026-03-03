/**
 * Polymarket Gamma API source for market draft feed.
 * Fetches events from https://gamma-api.polymarket.com/events and maps to draft-like structure.
 * Per Innovation.md - used for market drafting in CRE Chainlink.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { FeedConfig } from "../types/feed";
import { httpJsonRequest } from "../utils/http";

const DEFAULT_API_URL = "https://gamma-api.polymarket.com";
const DEFAULT_LIMIT = 50;

export interface PolymarketDraftInput {
  question: string;
  questionUri: string;
  outcomes: string[];
  resolveTime: number;
  tradingOpen: number;
  tradingClose: number;
  externalId: string;
  category?: string;
}

export interface PolymarketEventRaw {
  id?: string;
  ticker?: string;
  slug?: string;
  title?: string;
  description?: string;
  startDate?: string;
  creationDate?: string;
  endDate?: string;
  image?: string;
  icon?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  markets?: Array<{
    id?: string;
    question?: string;
    outcomePrices?: string;
  }>;
  tags?: Array<{ label?: string } | string>;
  category?: string;
}

export function fetchPolymarketEvents(
  runtime: Runtime<{ polymarket?: { apiUrl?: string; apiKey?: string } }>,
  feed: FeedConfig
): PolymarketDraftInput[] {
  const apiUrl = (runtime.config.polymarket?.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const apiKey = runtime.config.polymarket?.apiKey;
  const limit = feed.metadata?.limit ? parseInt(String(feed.metadata.limit), 10) : DEFAULT_LIMIT;
  const targetCategory = feed.category ?? feed.metadata?.category;

  const url = new URL(`${apiUrl}/events`);
  url.searchParams.set("limit", String(Math.min(limit, 100)));
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const response = httpJsonRequest(runtime, {
    url: url.toString(),
    method: "GET",
    headers,
  });

  const events: PolymarketEventRaw[] = JSON.parse(response.bodyText);
  if (!Array.isArray(events)) {
    return [];
  }

  const results: PolymarketDraftInput[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const event of events) {
    if (!event.title || !event.endDate) continue;
    if (event.closed || event.archived) continue;

    const endDateSec = Math.floor(new Date(event.endDate).getTime() / 1000);
    if (endDateSec <= now) continue;

    const eventCategory = resolveCategory(event, targetCategory);
    if (targetCategory && eventCategory !== targetCategory) continue;

    const outcomes = getOutcomes(event);
    if (outcomes.length < 2) continue;

    const startDateSec = event.startDate
      ? Math.floor(new Date(event.startDate).getTime() / 1000)
      : now;

    results.push({
      question: event.title,
      questionUri: event.description ? `ipfs://polymarket-${event.id ?? event.slug ?? "event"}` : event.title,
      outcomes,
      resolveTime: endDateSec,
      tradingOpen: startDateSec,
      tradingClose: endDateSec,
      externalId: `polymarket:${event.id ?? event.slug ?? event.ticker ?? "unknown"}`,
      category: eventCategory,
    });

    if (results.length >= limit) break;
  }

  return results;
}

function resolveCategory(event: PolymarketEventRaw, targetCategory?: string): string {
  if (event.tags && Array.isArray(event.tags) && event.tags.length > 0) {
    for (const tag of event.tags) {
      const label = typeof tag === "string" ? tag : tag?.label;
      if (label && POLYMARKET_CATEGORY_MAP[label]) {
        return POLYMARKET_CATEGORY_MAP[label];
      }
    }
  }
  if (event.category && POLYMARKET_CATEGORY_MAP[event.category]) {
    return POLYMARKET_CATEGORY_MAP[event.category];
  }
  return "Trending";
}

function getOutcomes(event: PolymarketEventRaw): string[] {
  if (event.markets && event.markets.length > 0) {
    const firstMarket = event.markets[0];
    if (firstMarket.outcomePrices) {
      try {
        const prices = JSON.parse(firstMarket.outcomePrices);
        if (Array.isArray(prices) && prices.length >= 2) {
          return ["Yes", "No"];
        }
      } catch {
        // fallback
      }
    }
  }
  return ["Yes", "No"];
}

const POLYMARKET_CATEGORY_MAP: Record<string, string> = {
  Politics: "Politics",
  Elections: "Politics",
  Crypto: "Crypto",
  Sports: "Sports",
  Science: "Space",
  Space: "Space",
  AI: "AI",
  Economics: "Macro",
  Macro: "Macro",
  Business: "Corporate",
  Corporate: "Corporate",
  Commodities: "Commodities",
  "Pop Culture": "Trending",
  Entertainment: "Trending",
};
