/**
 * Polymarket as resolution source for markets drafted from Polymarket.
 * When draft has externalId matching polymarket:${eventId} or polymarket:${slug},
 * fetches the Polymarket event and resolves from closed status + outcomePrices.
 */
import type { Runtime } from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "../../types/config";
import {
  fetchPolymarketEventBySlug,
  fetchPolymarketEventById,
  type PolymarketEventRaw,
} from "../../sources/polymarketEvents";

export type PolymarketResolutionResult =
  | { status: "SUCCESS"; outcomeIndex: number; confidence: number; reasoning: string }
  | { status: "NOT_CLOSED"; reason: string }
  | { status: "NOT_FOUND"; reason: string }
  | { status: "AMBIGUOUS"; reason: string };

/**
 * Parse externalId (e.g. "polymarket:evt123" or "polymarket:fed-decision-in-october")
 * to extract id or slug.
 */
function parseExternalId(locator: string): { id?: string; slug?: string } | null {
  if (!locator || !locator.startsWith("polymarket:")) return null;
  const rest = locator.slice("polymarket:".length).trim();
  if (!rest) return null;
  // Numeric id vs slug (slug has hyphens, id is often numeric)
  if (/^\d+$/.test(rest)) {
    return { id: rest };
  }
  return { slug: rest };
}

/**
 * Extract winning outcome index from closed Polymarket event.
 * outcomePrices: ["1.00", "0"] or ["0", "1"] means index 0 or 1 won.
 */
function getWinningOutcomeIndex(event: PolymarketEventRaw): number | null {
  if (!event.closed || !event.markets?.length) return null;
  const market = event.markets[0];
  if (!market?.outcomePrices) return null;
  try {
    const prices = JSON.parse(market.outcomePrices);
    if (!Array.isArray(prices) || prices.length < 2) return null;
    for (let i = 0; i < prices.length; i++) {
      const p = String(prices[i]).trim();
      if (p === "1" || p === "1.0" || p === "1.00" || parseFloat(p) >= 0.999) {
        return i;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch Polymarket resolution for a market drafted from Polymarket.
 * Returns SUCCESS with outcomeIndex when event is closed and outcomePrices indicate winner.
 */
export async function fetchPolymarketResolution(
  runtime: Runtime<WorkflowConfig>,
  locator: string
): Promise<PolymarketResolutionResult> {
  const parsed = parseExternalId(locator);
  if (!parsed) {
    return { status: "NOT_FOUND", reason: `Invalid Polymarket locator: ${locator}` };
  }

  let event: PolymarketEventRaw | null = null;
  if (parsed.id) {
    event = await fetchPolymarketEventById(runtime, parsed.id);
  } else if (parsed.slug) {
    event = await fetchPolymarketEventBySlug(runtime, parsed.slug);
  }

  if (!event) {
    return { status: "NOT_FOUND", reason: `Polymarket event not found: ${locator}` };
  }

  if (!event.closed) {
    return { status: "NOT_CLOSED", reason: "Polymarket event is not yet closed" };
  }

  const outcomeIndex = getWinningOutcomeIndex(event);
  if (outcomeIndex === null) {
    return { status: "AMBIGUOUS", reason: "Could not determine winning outcome from outcomePrices" };
  }

  return {
    status: "SUCCESS",
    outcomeIndex,
    confidence: 10000,
    reasoning: "Polymarket Gamma API closed event; outcomePrices indicate winner",
  };
}
