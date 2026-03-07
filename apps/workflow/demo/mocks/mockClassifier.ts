/**
 * Demo mock classifier — keyword-based classification per DEMO.md §7.1.
 * No LLM; deterministic rules: election→politics, ETH/price→crypto_asset, launch/token→crypto_product.
 */
import type { SourceObservation } from "../../src/domain/candidate";
import type { UnderstandingOutput } from "../../src/domain/understanding";

export function mockClassify(obs: SourceObservation): UnderstandingOutput {
  const text = `${obs.title} ${obs.body ?? ""}`.toLowerCase();

  let category: UnderstandingOutput["category"] = "crypto_asset";
  let eventType = "price_threshold";

  if (/\b(election|candidate|president|vote|ballot)\b/.test(text)) {
    category = "politics";
    eventType = "election_outcome";
  } else if (/\b(sports|team|game|match|championship)\b/.test(text)) {
    category = "sports";
    eventType = "sports_outcome";
  } else if (/\b(launch|token|announce|airdrop)\b/.test(text)) {
    category = "crypto_product";
    eventType = "product_launch";
  } else if (/\b(eth|btc|price|\$|usd)\b/.test(text)) {
    category = "crypto_asset";
    eventType = "price_threshold";
  } else if (/\b(weather|temperature|rain|snow)\b/.test(text)) {
    category = "weather";
    eventType = "weather_threshold";
  } else if (/\b(company|earnings|ipo|acquisition)\b/.test(text)) {
    category = "company_milestone";
    eventType = "company_event";
  } else if (/\b(macro|gdp|inflation|fed)\b/.test(text)) {
    category = "macro";
    eventType = "macro_threshold";
  }

  const candidateQuestion = obs.title.trim() || "Will the event occur?";
  const ambiguityScore = /\b(soon|eventually|maybe|might|could|possibly)\b/.test(text) ? 0.5 : 0.2;
  const marketabilityScore = category === "politics" || category === "sports" ? 0.3 : 0.85;

  return {
    canonicalSubject: obs.title,
    eventType,
    category,
    candidateQuestion,
    marketType: "binary",
    outcomes: ["Yes", "No"],
    entities: obs.tags ?? [],
    ambiguityScore,
    marketabilityScore,
    temporalWindow: obs.eventTime ? { resolvesBy: obs.eventTime } : undefined,
  };
}
