/**
 * Polymarket Gamma API — Tags for category discovery.
 * GET /tags returns ranked tags; used to filter events by tag_id or tag_slug.
 * Cache TTL: 1 hour.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import { httpJsonRequest } from "../utils/http";

const DEFAULT_API_URL = "https://gamma-api.polymarket.com";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface PolymarketTag {
  id: number;
  label: string;
  slug?: string;
}

let tagCache: { tags: PolymarketTag[]; expiresAt: number } | null = null;

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
 * Fetch ranked tags from Polymarket Gamma API.
 * Cached for 1 hour to avoid repeated calls.
 */
export function fetchPolymarketTags(
  runtime: Runtime<{ polymarket?: { apiUrl?: string; apiKey?: string } }>
): PolymarketTag[] {
  const now = Date.now();
  if (tagCache && tagCache.expiresAt > now) {
    return tagCache.tags;
  }

  const apiUrl = (runtime.config.polymarket?.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const apiKey = getPolymarketApiKey(runtime);

  const url = new URL(`${apiUrl}/tags`);

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
    const raw = JSON.parse(response.bodyText);
    const tags: PolymarketTag[] = Array.isArray(raw)
      ? raw.map((t: { id?: number; label?: string; slug?: string }) => ({
          id: typeof t.id === "number" ? t.id : 0,
          label: String(t.label ?? t.slug ?? ""),
          slug: typeof t.slug === "string" ? t.slug : undefined,
        }))
      : [];
    tagCache = { tags, expiresAt: now + CACHE_TTL_MS };
    return tags;
  } catch {
    if (tagCache) return tagCache.tags;
    return [];
  }
}

/** Clear tag cache (e.g. for tests). */
export function clearPolymarketTagCache(): void {
  tagCache = null;
}
