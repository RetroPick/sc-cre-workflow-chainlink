/**
 * Polymarket Gamma API — direct markets endpoint.
 * GET /markets for categorical markets where each outcome is a separate market.
 * Use when events are too coarse; each market maps to one draft.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { FeedConfig } from "../types/feed";
import { httpJsonRequest } from "../utils/http";
import type { PolymarketDraftInput } from "./polymarketEvents";

const DEFAULT_API_URL = "https://gamma-api.polymarket.com";
const DEFAULT_LIMIT = 50;

interface PolymarketMarketRaw {
  id?: string;
  question?: string;
  slug?: string;
  conditionId?: string;
  outcomes?: string;
  outcomePrices?: string;
  endDate?: string;
  startDate?: string;
  volume?: number;
  liquidity?: number;
  volume24hr?: number;
  active?: boolean;
  closed?: boolean;
  category?: string;
  eventSlug?: string;
  eventId?: string;
}

/** Resolve Polymarket API key from CRE secret or config. */
function getPolymarketApiKey(runtime: Runtime<{ polymarket?: { apiKey?: string } }>): string | undefined {
  try {
    const secret = runtime.getSecret({ id: "POLYMARKET_API_KEY" }).result();
    if (secret?.value) return secret.value;
  } catch {
    // fallback to config
  }
  return runtime.config.polymarket?.apiKey;
}

export function fetchPolymarketMarkets(
  runtime: Runtime<{ polymarket?: { apiUrl?: string; apiKey?: string } }>,
  feed: FeedConfig
): PolymarketDraftInput[] {
  const apiUrl = (runtime.config.polymarket?.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const apiKey = getPolymarketApiKey(runtime);
  const limit = feed.metadata?.limit ? parseInt(String(feed.metadata.limit), 10) : DEFAULT_LIMIT;
  const tagId = feed.metadata?.tagId ? parseInt(String(feed.metadata.tagId), 10) : undefined;
  const tagSlug = feed.metadata?.tagSlug;
  const slug = feed.metadata?.slug;
  const order = feed.metadata?.order ?? "volume_24hr";
  const ascending = feed.metadata?.ascending === "true" || feed.metadata?.ascending === true;

  const url = new URL(`${apiUrl}/markets`);
  url.searchParams.set("limit", String(Math.min(limit, 100)));
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("order", order);
  url.searchParams.set("ascending", String(ascending));
  if (tagId != null && !Number.isNaN(tagId)) url.searchParams.set("tag_id", String(tagId));
  if (tagSlug) url.searchParams.set("tag_slug", tagSlug);
  if (slug) url.searchParams.set("slug", slug);
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  try {
    const response = httpJsonRequest(runtime, {
      url: url.toString(),
      method: "GET",
      headers,
    });
    const markets: PolymarketMarketRaw[] = JSON.parse(response.bodyText);
    if (!Array.isArray(markets)) return [];

    const now = Math.floor(Date.now() / 1000);
    const results: PolymarketDraftInput[] = [];

    for (const m of markets) {
      if (!m.question || !m.endDate) continue;
      if (m.closed) continue;

      const endDateSec = Math.floor(new Date(m.endDate).getTime() / 1000);
      if (endDateSec <= now) continue;

      const outcomes = parseOutcomes(m);
      if (outcomes.length < 2) continue;

      const startDateSec = m.startDate
        ? Math.floor(new Date(m.startDate).getTime() / 1000)
        : now;

      const marketId = m.id ?? m.slug ?? m.conditionId ?? "unknown";
      const externalId = `polymarket:${m.eventId ?? m.eventSlug ?? marketId}`;

      results.push({
        question: m.question,
        questionUri: m.question,
        outcomes,
        resolveTime: endDateSec,
        tradingOpen: startDateSec,
        tradingClose: endDateSec,
        externalId,
        category: m.category ?? "Trending",
        polymarketId: m.eventId ?? m.id,
        polymarketSlug: m.eventSlug ?? m.slug,
        volume: m.volume,
        liquidity: m.liquidity,
        volume24hr: m.volume24hr,
      });

      if (results.length >= limit) break;
    }

    return results;
  } catch {
    return [];
  }
}

function parseOutcomes(m: PolymarketMarketRaw): string[] {
  if (m.outcomes) {
    try {
      const parsed = JSON.parse(m.outcomes);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        return parsed.map(String);
      }
    } catch {
      // fallback
    }
  }
  return ["Yes", "No"];
}
