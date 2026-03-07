/**
 * Classification layer — infers category, market type, ambiguity.
 * Uses LLM when useLlm and llm provided; otherwise rule-based fallback.
 */
import type { SourceObservation } from "../domain/candidate";
import type { UnderstandingOutput } from "../domain/understanding";
import type { LlmProvider } from "../models/interfaces";
import { UNDERSTANDING_SYSTEM_PROMPT } from "../models/prompts/classify.prompt";

const CATEGORY_MAP: Record<string, UnderstandingOutput["category"]> = {
  crypto: "crypto_asset",
  Crypto: "crypto_asset",
  news: "company_milestone",
  dev: "science",
  custom: "unknown",
  Trending: "entertainment",
  Politics: "politics",
  Sports: "sports",
  Space: "science",
  AI: "science",
  Macro: "macro",
  Corporate: "company_milestone",
  Commodities: "macro",
};

export type ClassifyOptions = {
  llm?: LlmProvider;
  useLlm?: boolean;
};

export async function classifyCandidate(
  obs: SourceObservation,
  options?: ClassifyOptions
): Promise<UnderstandingOutput> {
  if (options?.llm && options?.useLlm) {
    const text = [obs.title, obs.body ?? ""].filter(Boolean).join("\n\n");
    const result = await options.llm.completeJson<UnderstandingOutput>({
      system: UNDERSTANDING_SYSTEM_PROMPT,
      user: text,
      schemaName: "UnderstandingOutput",
      temperature: 0,
    });
    return normalizeUnderstandingOutput(result, obs);
  }
  return Promise.resolve(classifyRuleBased(obs));
}

function normalizeUnderstandingOutput(
  raw: Partial<UnderstandingOutput>,
  obs: SourceObservation
): UnderstandingOutput {
  const category = (raw.category && isValidCategory(raw.category))
    ? raw.category
    : inferCategory(obs);
  return {
    canonicalSubject: raw.canonicalSubject ?? obs.title,
    eventType: raw.eventType ?? obs.sourceType,
    category,
    subcategory: raw.subcategory,
    candidateQuestion: raw.candidateQuestion ?? obs.title,
    marketType: raw.marketType && isValidMarketType(raw.marketType) ? raw.marketType : inferMarketType(obs),
    outcomes: raw.outcomes,
    entities: Array.isArray(raw.entities) ? raw.entities : (obs.entityHints ?? []),
    ambiguityScore: typeof raw.ambiguityScore === "number" ? Math.min(1, Math.max(0, raw.ambiguityScore)) : estimateAmbiguity(obs),
    marketabilityScore: typeof raw.marketabilityScore === "number" ? Math.min(1, Math.max(0, raw.marketabilityScore)) : 1 - estimateAmbiguity(obs) * 0.5,
    duplicateClusterId: raw.duplicateClusterId,
    temporalWindow: raw.temporalWindow ?? (obs.eventTime ? { resolvesBy: obs.eventTime } : undefined),
  };
}

const VALID_CATEGORIES: UnderstandingOutput["category"][] = [
  "macro", "weather", "crypto_asset", "crypto_product", "governance",
  "company_milestone", "regulatory", "politics", "sports", "war_violence",
  "science", "entertainment", "unknown",
];
function isValidCategory(c: string): c is UnderstandingOutput["category"] {
  return VALID_CATEGORIES.includes(c as UnderstandingOutput["category"]);
}

const VALID_MARKET_TYPES = ["binary", "categorical", "timeline", "invalid"] as const;
function isValidMarketType(m: string): m is UnderstandingOutput["marketType"] {
  return VALID_MARKET_TYPES.includes(m as UnderstandingOutput["marketType"]);
}

function classifyRuleBased(obs: SourceObservation): UnderstandingOutput {
  const category = inferCategory(obs);
  const candidateQuestion = obs.title;
  const marketType = inferMarketType(obs);
  const ambiguityScore = estimateAmbiguity(obs);
  const marketabilityScore = 1 - ambiguityScore * 0.5;

  return {
    canonicalSubject: obs.title,
    eventType: obs.sourceType,
    category,
    candidateQuestion,
    marketType,
    entities: obs.entityHints ?? [],
    ambiguityScore,
    marketabilityScore,
    temporalWindow: obs.eventTime ? { resolvesBy: obs.eventTime } : undefined,
  };
}

function inferCategory(obs: SourceObservation): UnderstandingOutput["category"] {
  if (obs.tags && obs.tags.length > 0) {
    const tag = obs.tags[0];
    if (CATEGORY_MAP[tag]) return CATEGORY_MAP[tag];
  }
  switch (obs.sourceType) {
    case "coinGecko":
      return "crypto_asset";
    case "newsAPI":
      return "company_milestone";
    case "githubTrends":
      return "science";
    case "polymarket":
      return "entertainment";
    default:
      return "unknown";
  }
}

function inferMarketType(obs: SourceObservation): UnderstandingOutput["marketType"] {
  const raw = obs.raw as { outcomes?: string[] };
  if (raw?.outcomes && Array.isArray(raw.outcomes) && raw.outcomes.length > 2) {
    return "categorical";
  }
  return "binary";
}

function estimateAmbiguity(obs: SourceObservation): number {
  const text = `${obs.title} ${obs.body ?? ""}`.toLowerCase();
  const ambiguousPhrases = ["might", "maybe", "could", "possibly", "unclear", "tbd"];
  let score = 0.2;
  for (const p of ambiguousPhrases) {
    if (text.includes(p)) score += 0.15;
  }
  return Math.min(score, 1);
}
