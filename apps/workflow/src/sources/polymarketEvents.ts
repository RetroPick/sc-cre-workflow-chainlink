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

export type PolymarketOrderParam = "volume_24hr" | "volume" | "liquidity" | "end_date" | "start_date" | "competitive" | "closed_time";

export interface PolymarketDraftInput {
  question: string;
  questionUri: string;
  outcomes: string[];
  resolveTime: number;
  tradingOpen: number;
  tradingClose: number;
  externalId: string;
  category?: string;
  /** Polymarket event id for resolution lookup */
  polymarketId?: string;
  /** Polymarket slug for resolution lookup */
  polymarketSlug?: string;
  volume?: number;
  liquidity?: number;
  volume24hr?: number;
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
  volume?: number;
  liquidity?: number;
  volume24hr?: number;
  markets?: Array<{
    id?: string;
    question?: string;
    outcomePrices?: string;
  }>;
  tags?: Array<{ label?: string } | string>;
  category?: string;
}

/** Resolve Polymarket API key from CRE secret or config. Never commit to source. */
function getPolymarketApiKey(runtime: Runtime<{ polymarket?: { apiKey?: string } }>): string | undefined {
  try {
    const secret = runtime.getSecret({ id: "POLYMARKET_API_KEY" }).result();
    if (secret?.value) return secret.value;
  } catch {
    // fallback to config
  }
  return runtime.config.polymarket?.apiKey;
}

export function fetchPolymarketEvents(
  runtime: Runtime<{ polymarket?: { apiUrl?: string; apiKey?: string } }>,
  feed: FeedConfig
): PolymarketDraftInput[] {
  const apiUrl = (runtime.config.polymarket?.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const apiKey = getPolymarketApiKey(runtime);
  const limit = feed.metadata?.limit ? parseInt(String(feed.metadata.limit), 10) : DEFAULT_LIMIT;
  const targetCategory = feed.category ?? feed.metadata?.category;
  const order = (feed.metadata?.order as PolymarketOrderParam) ?? "volume_24hr";
  const ascending = feed.metadata?.ascending === "true" || feed.metadata?.ascending === true;
  const tagId = feed.metadata?.tagId ? parseInt(String(feed.metadata.tagId), 10) : undefined;
  const tagSlug = feed.metadata?.tagSlug;
  const slug = feed.metadata?.slug;
  const liquidityMin = feed.metadata?.liquidityMin ? parseFloat(String(feed.metadata.liquidityMin)) : undefined;
  const volumeMin = feed.metadata?.volumeMin ? parseFloat(String(feed.metadata.volumeMin)) : undefined;
  const endDateMin = feed.metadata?.endDateMin;
  const endDateMax = feed.metadata?.endDateMax;

  const url = new URL(`${apiUrl}/events`);
  url.searchParams.set("limit", String(Math.min(limit, 100)));
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("order", order);
  url.searchParams.set("ascending", String(ascending));
  if (tagId != null && !Number.isNaN(tagId)) url.searchParams.set("tag_id", String(tagId));
  if (tagSlug) url.searchParams.set("tag_slug", tagSlug);
  if (slug) url.searchParams.set("slug", slug);
  if (liquidityMin != null && !Number.isNaN(liquidityMin)) url.searchParams.set("liquidity_min", String(liquidityMin));
  if (volumeMin != null && !Number.isNaN(volumeMin)) url.searchParams.set("volume_min", String(volumeMin));
  if (endDateMin) url.searchParams.set("end_date_min", endDateMin);
  if (endDateMax) url.searchParams.set("end_date_max", endDateMax);
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

    const eventId = event.id ?? event.slug ?? event.ticker ?? "unknown";

    results.push({
      question: event.title,
      questionUri: event.description ? `ipfs://polymarket-${eventId}` : event.title,
      outcomes,
      resolveTime: endDateSec,
      tradingOpen: startDateSec,
      tradingClose: endDateSec,
      externalId: `polymarket:${eventId}`,
      category: eventCategory,
      polymarketId: typeof event.id === "string" ? event.id : undefined,
      polymarketSlug: event.slug,
      volume: event.volume,
      liquidity: event.liquidity,
      volume24hr: event.volume24hr,
    });

    if (results.length >= limit) break;
  }

  return results;
}

/**
 * Fetch a single Polymarket event by slug. Used for resolution lookup.
 */
export function fetchPolymarketEventBySlug(
  runtime: Runtime<{ polymarket?: { apiUrl?: string; apiKey?: string } }>,
  slug: string
): PolymarketEventRaw | null {
  const apiUrl = (runtime.config.polymarket?.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const apiKey = getPolymarketApiKey(runtime);

  const url = new URL(`${apiUrl}/events`);
  url.searchParams.set("slug", slug);

  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  try {
    const response = httpJsonRequest(runtime, {
      url: url.toString(),
      method: "GET",
      headers,
    });
    const events: PolymarketEventRaw[] = JSON.parse(response.bodyText);
    if (Array.isArray(events) && events.length > 0) {
      return events[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch a single Polymarket event by id. Used for resolution lookup.
 */
export function fetchPolymarketEventById(
  runtime: Runtime<{ polymarket?: { apiUrl?: string; apiKey?: string } }>,
  id: string
): PolymarketEventRaw | null {
  const apiUrl = (runtime.config.polymarket?.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const apiKey = getPolymarketApiKey(runtime);

  const url = `${apiUrl}/events/${encodeURIComponent(id)}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  try {
    const response = httpJsonRequest(runtime, {
      url,
      method: "GET",
      headers,
    });
    const event = JSON.parse(response.bodyText);
    if (event && typeof event === "object" && (event.id || event.slug)) {
      return event as PolymarketEventRaw;
    }
    return null;
  } catch {
    return null;
  }
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
