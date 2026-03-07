/**
 * Polymarket Gamma API — public search.
 * GET /public-search to find similar events/markets before creating new draft.
 * Reduces duplicate drafting; cross-reference resolution plans.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import { httpJsonRequest } from "../utils/http";
import type { PolymarketDraftInput } from "./polymarketEvents";

const DEFAULT_API_URL = "https://gamma-api.polymarket.com";

interface SearchResultItem {
  id?: string;
  slug?: string;
  title?: string;
  question?: string;
  description?: string;
  endDate?: string;
  startDate?: string;
  outcomes?: string[];
  outcomePrices?: string[];
  type?: string;
  category?: string;
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

/**
 * Search Polymarket for events/markets matching query.
 * Returns draft-like items for cross-reference before creating new draft.
 */
export function searchPolymarket(
  runtime: Runtime<{ polymarket?: { apiUrl?: string; apiKey?: string } }>,
  query: string,
  limit = 10
): PolymarketDraftInput[] {
  const apiUrl = (runtime.config.polymarket?.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const apiKey = getPolymarketApiKey(runtime);

  const url = new URL(`${apiUrl}/public-search`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(Math.min(limit, 50)));

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
    const data = JSON.parse(response.bodyText);

    // API may return { events: [...], markets: [...] } or array
    const items: SearchResultItem[] = Array.isArray(data)
      ? data
      : [...(data.events ?? []), ...(data.markets ?? [])];

    const now = Math.floor(Date.now() / 1000);
    const results: PolymarketDraftInput[] = [];

    for (const item of items) {
      const title = item.title ?? item.question;
      if (!title) continue;

      const endDate = item.endDate;
      if (!endDate) continue;

      const endDateSec = Math.floor(new Date(endDate).getTime() / 1000);
      if (endDateSec <= now) continue;

      const outcomes = Array.isArray(item.outcomes) && item.outcomes.length >= 2
        ? item.outcomes.map(String)
        : ["Yes", "No"];

      const startDateSec = item.startDate
        ? Math.floor(new Date(item.startDate).getTime() / 1000)
        : now;

      const itemId = item.id ?? item.slug ?? "unknown";
      const externalId = `polymarket:${itemId}`;

      results.push({
        question: title,
        questionUri: item.description ?? title,
        outcomes,
        resolveTime: endDateSec,
        tradingOpen: startDateSec,
        tradingClose: endDateSec,
        externalId,
        category: item.category ?? "Trending",
        polymarketId: item.id,
        polymarketSlug: item.slug,
      });

      if (results.length >= limit) break;
    }

    return results;
  } catch {
    return [];
  }
}
