/**
 * Oracleability scoring — determines if market can be resolved.
 * Uses understanding + evidence to build resolution sources and score.
 * Per 03_SafetyComplienceLayer.md.
 */
import type { SourceObservation } from "../domain/candidate";
import type { UnderstandingOutput } from "../domain/understanding";
import type { EvidenceBundle, EvidenceLink } from "../domain/evidence";
import type {
  OracleabilityResult,
  ResolutionSource,
} from "../domain/resolutionPlan";
import { SOURCE_TYPE_BASE_TRUST } from "../policy/sourceTrust";

function inferResolutionSourceType(
  link: EvidenceLink
): ResolutionSource["sourceType"] {
  const st = (link.sourceType ?? "").toLowerCase();
  if (st.includes("onchain")) return "onchain_event";
  if (st.includes("official_api") || st === "coingecko") return "official_api";
  if (st.includes("official_site") || st.includes("official_blog") || st.includes("official_website")) {
    return "official_website";
  }
  if (st.includes("dataset") || st.includes("public_data")) return "public_dataset";
  if (st.includes("llm")) return "llm_consensus";
  if (st.includes("manual")) return "manual_review";
  if (st === "polymarket") return "polymarket";
  if (st === "news" || st === "github") return "public_dataset";
  return "public_dataset";
}

function toResolutionSource(link: EvidenceLink): ResolutionSource {
  const sourceType = inferResolutionSourceType(link);
  const baseTrust = SOURCE_TYPE_BASE_TRUST[sourceType] ?? 0.5;
  return {
    sourceType,
    locator: link.url,
    trustScore: Math.max(link.trustScore ?? 0.5, baseTrust),
    notes: link.label,
  };
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function dedupeSources(sources: ResolutionSource[]): ResolutionSource[] {
  const seen = new Set<string>();
  const out: ResolutionSource[] = [];
  for (const s of sources) {
    const key = `${s.sourceType}:${s.locator}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function deriveResolutionPredicate(
  understanding: UnderstandingOutput,
  obs: SourceObservation
): string {
  const question = understanding.candidateQuestion?.trim() ?? obs.title;
  switch (understanding.category) {
    case "crypto_asset":
    case "macro":
    case "weather":
      return `Resolve by checking the authoritative value/source at or after the market resolution time for: ${question}`;
    case "crypto_product":
    case "company_milestone":
    case "governance":
    case "science":
      return `Resolve YES only if an official source confirms the event described in: ${question}; otherwise resolve NO after deadline`;
    case "regulatory":
      return `Resolve using official regulatory or issuer communications for: ${question}`;
    default:
      return `Resolve using the highest-trust approved sources for: ${question}`;
  }
}

function chooseResolutionMode(
  understanding: UnderstandingOutput,
  primarySources: ResolutionSource[]
): OracleabilityResult["resolutionMode"] {
  const types = new Set(primarySources.map((s) => s.sourceType));
  if (types.has("onchain_event")) return "deterministic";
  if (types.has("polymarket")) return "deterministic";
  if (types.has("official_api") && primarySources.length >= 1) return "deterministic";
  if (
    types.has("official_website") ||
    (types.has("official_api") && primarySources.length >= 2)
  ) {
    return "multi_source_deterministic";
  }
  if (understanding.category === "unknown") return "human_review";
  return "ai_assisted";
}

function computeOracleabilityScore(
  understanding: UnderstandingOutput,
  primary: ResolutionSource[],
  fallback: ResolutionSource[]
): number {
  const primaryTrust = avg(primary.map((s) => s.trustScore));
  const fallbackTrust = avg(fallback.map((s) => s.trustScore));
  let score = 0;
  score += primary.length > 0 ? 0.35 : 0;
  score += primary.length >= 2 ? 0.1 : 0;
  score += primaryTrust * 0.35;
  score += Math.min(fallback.length, 2) * 0.05;
  score += fallbackTrust * 0.05;
  score += (1 - (understanding.ambiguityScore ?? 0)) * 0.1;
  if (understanding.marketType === "invalid") score -= 0.25;
  if (understanding.category === "unknown") score -= 0.2;
  return Math.max(0, Math.min(1, score));
}

function rankEvidenceForResolution(
  evidence: EvidenceBundle,
  observation?: SourceObservation
): { primary: ResolutionSource[]; fallback: ResolutionSource[] } {
  const allPrimary = evidence.primary.map(toResolutionSource);
  const allSupporting = evidence.supporting.map(toResolutionSource);

  // When observation is from Polymarket, add Polymarket as primary resolution source
  const polymarketSource: ResolutionSource[] = [];
  if (observation?.sourceType === "polymarket" && observation.externalId) {
    polymarketSource.push({
      sourceType: "polymarket",
      locator: observation.externalId,
      trustScore: 0.9,
      notes: "Polymarket Gamma API closed event",
    });
  }

  const primary = dedupeSources(
    [...polymarketSource, ...allPrimary].sort((a, b) => b.trustScore - a.trustScore)
  ).slice(0, 3);
  const fallback = dedupeSources(
    [...allSupporting].sort((a, b) => b.trustScore - a.trustScore)
  ).slice(0, 3);
  return { primary, fallback };
}

export function buildOracleability(
  observation: SourceObservation,
  understanding: UnderstandingOutput,
  evidence: EvidenceBundle
): OracleabilityResult {
  const { primary, fallback } = rankEvidenceForResolution(evidence);
  const resolutionMode = chooseResolutionMode(understanding, primary);
  const resolutionPredicate = deriveResolutionPredicate(understanding, observation);
  const oracleabilityScore = computeOracleabilityScore(understanding, primary, fallback);

  const reasons: string[] = [];
  if (primary.length === 0) {
    reasons.push("No trusted primary resolution sources found");
  } else {
    reasons.push(`Found ${primary.length} primary resolution source(s)`);
  }
  reasons.push(`Resolution mode selected: ${resolutionMode}`);
  reasons.push(`Oracleability score computed: ${oracleabilityScore.toFixed(2)}`);

  return {
    oracleabilityScore,
    resolutionMode,
    primarySources: primary,
    fallbackSources: fallback,
    resolutionPredicate,
    reasons,
  };
}

/** @deprecated Use buildOracleability. Kept for backward compat. */
export function scoreOracleability(obs: SourceObservation): number {
  const SOURCE_TRUST: Record<string, number> = {
    coinGecko: 0.9,
    polymarket: 0.75,
    newsAPI: 0.7,
    githubTrends: 0.75,
    custom: 0.5,
  };
  return SOURCE_TRUST[obs.sourceType] ?? 0.6;
}
